import { useState } from 'react';
import { useT } from '../i18n.jsx';

// Product SVG with a flat placeholder if the file is missing.
export default function ProductImage({ doc, className = '', loading = 'lazy' }) {
  const { pick } = useT();
  const [failed, setFailed] = useState(false);
  const alt = doc.image_alt || pick(doc, 'title');
  if (!doc.image_url || failed) {
    return <div className={`img-fallback ${className}`} role="img" aria-label={alt}><span aria-hidden="true">{(doc.title || '?').slice(0, 1)}</span></div>;
  }
  return <img className={className} src={doc.image_url} alt={alt} loading={loading} onError={() => setFailed(true)} />;
}
