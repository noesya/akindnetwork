import { useTranslation } from 'react-i18next';

type Props = {
  /** className for the underlying <img>; sized via CSS in _home.scss / _about.scss. */
  className?: string;
};

/**
 * Kind wordmark — black SVG by default, white SVG in dark mode.
 *
 * Uses <picture> with prefers-color-scheme media query so the browser swaps
 * the source itself. Native, no JS state, no flash at theme switch.
 */
export default function Logo({ className }: Props) {
  const { t } = useTranslation();
  const alt = t('about.title');
  return (
    <picture>
      <source srcSet="/images/logo-white.svg" media="(prefers-color-scheme: dark)" />
      <img src="/images/logo-black.svg" alt={alt} className={className} />
    </picture>
  );
}
