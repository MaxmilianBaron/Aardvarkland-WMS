import { useEffect, useState } from 'react';
import { isRouteKey, RouteKey } from './navigation';

function readRoute(): RouteKey {
  const route = window.location.hash.replace('#', '') || '/overview';
  return isRouteKey(route) ? route : '/overview';
}

export function useHashRoute() {
  const [route, setRouteState] = useState<RouteKey>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRouteState(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setRoute = (nextRoute: RouteKey) => {
    window.location.hash = nextRoute;
    setRouteState(nextRoute);
  };

  return { route, setRoute };
}
