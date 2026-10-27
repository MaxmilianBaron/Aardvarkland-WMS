import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../dist/generated/prisma/client.js');
const { lockPostgresAdvisoryTransaction } = require('../dist/database/transaction-locks.js');
const { AuthService } = require('../dist/auth/auth.service.js');
const { AllocationService } = require('../dist/allocation/allocation.service.js');
const { OwnerScopeService } = require('../dist/clients/owner-scope.service.js');

const connectionString = process.env.WMS_TEST_DATABASE_URL;
assert.ok(connectionString, 'WMS_TEST_DATABASE_URL must point to a dedicated migrated test database');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const pool = new pg.Pool({ connectionString });
const hashToken = token => createHash('sha256').update(token).digest('hex');
let user;
before(async () => {
  user = await prisma.user.create({ data: { email: `regression-${randomUUID()}@example.test`, displayName: 'Regression', passwordHash: 'unused' } });
});
after(async () => { await prisma.$disconnect(); await pool.end(); });
const raw = client => ({ $queryRawUnsafe: async (sql, ...values) => (await client.query(sql, values)).rows });

for (const finish of ['COMMIT', 'ROLLBACK']) {
  test(`advisory lock blocks another connection until ${finish}`, async () => {
    const first = await pool.connect(); const second = await pool.connect();
    const key = randomUUID();
    try {
      await first.query('BEGIN'); await second.query('BEGIN');
      await lockPostgresAdvisoryTransaction(raw(first), 'stock_quant_identity', key);
      const held = await first.query("SELECT count(*)::int n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted");
      assert.equal(held.rows[0].n, 1);
      const pid = (await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      let acquired = false;
      const waiting = lockPostgresAdvisoryTransaction(raw(second), 'stock_quant_identity', key).then(() => { acquired = true; });
      for (let i=0;i<100;i++) {
        const count = await pool.query("SELECT count(*)::int n FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted", [pid]);
        if (count.rows[0].n === 1) break;
        await delay(10);
      }
      assert.equal(acquired, false);
      assert.equal((await pool.query("SELECT count(*)::int n FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted", [pid])).rows[0].n, 1);
      await first.query(finish);
      await waiting;
      assert.equal(acquired, true);
      await second.query('ROLLBACK');
    } finally { await first.query('ROLLBACK'); await second.query('ROLLBACK'); first.release(); second.release(); }
  });
}

function authService() {
  const config = { get(name) { return ({ JWT_REFRESH_TOKEN_TTL_SECONDS: 3600, JWT_ACCESS_TOKEN_TTL_SECONDS: 60, JWT_SECRET: 'test-only', JWT_ISSUER: 'test', JWT_AUDIENCE: 'test', JWT_KEY_ID: 'test' })[name]; } };
  const users = { findUserWithAccessById: id => prisma.user.findUnique({where:{id}}), toAuthenticatedUser: row => ({...row, permissions:[],warehouses:[],clientAccess:[]}) };
  return new AuthService(users, { signAsync: async () => 'test-access-token' }, config, prisma);
}
async function newSession() {
  const token = `rt_${randomUUID()}`; const family = randomUUID();
  await prisma.refreshTokenSession.create({ data: { userId: user.id, tokenHash: hashToken(token), familyId: family, expiresAt: new Date(Date.now()+3600_000) } });
  return { token, family };
}

test('refresh replay commits family revocation and rejects the successor', async () => {
  const service = authService(); const {token,family} = await newSession();
  const replacement = await service.refresh({refreshToken:token});
  await assert.rejects(service.refresh({refreshToken:token}), /Invalid refresh token/);
  assert.equal(await prisma.refreshTokenSession.count({where:{familyId:family,status:'ACTIVE'}}),0);
  await assert.rejects(service.refresh({refreshToken:replacement.refreshToken}), /Invalid refresh token/);
});

test('concurrent refresh of one token returns at most one successor and revokes it on replay', async () => {
  const service = authService(); const {token,family} = await newSession();
  const results = await Promise.allSettled([service.refresh({refreshToken:token}),service.refresh({refreshToken:token})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(await prisma.refreshTokenSession.count({where:{familyId:family,status:'ACTIVE'}}),0);
});

test('logout using a rotated token revokes its replacement', async () => {
  const service = authService(); const {token,family} = await newSession();
  const replacement=await service.refresh({refreshToken:token});
  await service.revokeRefreshToken({id:user.id},{refreshToken:token});
  assert.equal(await prisma.refreshTokenSession.count({where:{familyId:family,status:'ACTIVE'}}),0);
  await assert.rejects(service.refresh({refreshToken:replacement.refreshToken}), /Invalid refresh token/);
});

test('two concurrent allocations reserve only the ordered quantity on real PostgreSQL', async () => {
  const code = `REG-${randomUUID().slice(0,8).toUpperCase()}`;
  const warehouse=await prisma.warehouse.create({data:{code,name:code}});
  const location=await prisma.warehouseLocation.create({data:{warehouseId:warehouse.id,code:'A1',name:'A1',type:'STORAGE'}});
  const product=await prisma.product.create({data:{code,name:code}});
  const sku=await prisma.sku.create({data:{code,name:code,productId:product.id}});
  const quant=await prisma.stockQuant.create({data:{warehouseId:warehouse.id,locationId:location.id,skuId:sku.id,quantity:100,status:'AVAILABLE'}});
  const order=await prisma.outboundOrder.create({data:{warehouseId:warehouse.id,orderNumber:code,lines:{create:{lineNumber:'1',sku:code,orderedQuantity:10}}},include:{lines:true}});
  const actor={id:user.id,permissions:['*'],warehouses:[],clientAccess:[]};
  const service=new AllocationService(prisma,new OwnerScopeService(prisma));
  const results=await Promise.all([service.allocateOutboundOrder(code,order.id,{},actor),service.allocateOutboundOrder(code,order.id,{},actor)]);
  const reserved=await prisma.reservation.aggregate({where:{outboundOrderId:order.id,status:'ACTIVE'},_sum:{quantity:true}});
  assert.equal(reserved._sum.quantity,10);
  assert.equal(results.reduce((sum,item)=>sum+item.lines[0].allocatedQuantity,0),10);
  assert.equal((await prisma.stockQuant.findUnique({where:{id:quant.id}})).reservedQuantity,10);
  await prisma.outboundOrder.update({where:{id:order.id},data:{status:'CANCELLED'}});
  await assert.rejects(service.allocateOutboundOrder(code,order.id,{},actor),/current status/);
});

async function reservationFixture() {
  const code=`REG-${randomUUID().slice(0,8).toUpperCase()}`;
  const warehouse=await prisma.warehouse.create({data:{code,name:code}});
  const location=await prisma.warehouseLocation.create({data:{warehouseId:warehouse.id,code:'A1',name:'A1',type:'STORAGE'}});
  const product=await prisma.product.create({data:{code,name:code}});
  const sku=await prisma.sku.create({data:{code,name:code,productId:product.id}});
  const quant=await prisma.stockQuant.create({data:{warehouseId:warehouse.id,locationId:location.id,skuId:sku.id,quantity:100,status:'AVAILABLE'}});
  const order=await prisma.outboundOrder.create({data:{warehouseId:warehouse.id,orderNumber:code,lines:{create:{lineNumber:'1',sku:code,orderedQuantity:10}}},include:{lines:true}});
  const actor={id:user.id,permissions:['*'],warehouses:[],clientAccess:[]};
  const { ReservationsService }=require('../dist/reservations/reservations.service.js');
  return {code,warehouse,quant,order,actor,reservations:new ReservationsService(prisma,new OwnerScopeService(prisma)),allocation:new AllocationService(prisma,new OwnerScopeService(prisma))};
}
test('manual reservation and allocation share the same order quantity limit', async()=>{
  const f=await reservationFixture();
  const manual={stockQuantReference:f.quant.id,quantity:6,outboundOrderId:f.order.id,outboundOrderLineId:f.order.lines[0].id};
  const outcomes=await Promise.allSettled([f.reservations.create(f.code,manual,f.actor),f.allocation.allocateOutboundOrder(f.code,f.order.id,{},f.actor)]);
  assert.equal(outcomes[1].status,'fulfilled');
  const sum=await prisma.reservation.aggregate({where:{outboundOrderId:f.order.id,status:'ACTIVE'},_sum:{quantity:true}});
  assert.equal(sum._sum.quantity,10);
  assert.equal((await prisma.stockQuant.findUnique({where:{id:f.quant.id}})).reservedQuantity,10);
});
test('release racing allocation preserves matching stock and reservation totals', async()=>{
  const f=await reservationFixture();
  const r=await f.reservations.create(f.code,{stockQuantReference:f.quant.id,quantity:10,outboundOrderId:f.order.id,outboundOrderLineId:f.order.lines[0].id},f.actor);
  await Promise.all([f.reservations.release(f.code,r.id,{},f.actor),f.allocation.allocateOutboundOrder(f.code,f.order.id,{},f.actor)]);
  const sum=(await prisma.reservation.aggregate({where:{outboundOrderId:f.order.id,status:'ACTIVE'},_sum:{quantity:true}}))._sum.quantity??0;
  assert.ok(sum===0||sum===10);
  assert.equal((await prisma.stockQuant.findUnique({where:{id:f.quant.id}})).reservedQuantity,sum);
});
