import { useState, type AnchorHTMLAttributes } from 'react';
import { nativeMode, openExternalLink } from './transport';
import { ServiceMessage } from './i18n';

export function ExternalLink({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [error, setError] = useState('');
  return <>
    <a {...props} href={href} onClick={nativeMode ? event => {
      event.preventDefault();
      setError('');
      void openExternalLink(href).catch(error => setError(error.message));
    } : props.onClick}>{children}</a>
    {error && <span role="alert"><ServiceMessage value={error} error /></span>}
  </>;
}
