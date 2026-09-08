import { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { cx } from '../../core/utils/format';

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ children, className, tone = 'secondary', size = 'md', ...props }: PropsWithChildren<ButtonProps>) {
  return (
    <button className={cx('button', `button--${tone}`, `button--${size}`, className)} {...props}>
      {children}
    </button>
  );
}
