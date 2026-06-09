import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';

const keys = [
  'perDay',
  'noScroll',
  'peerReviewed',
  'sourced',
  'singleFeatured',
  'noAds',
  'interoperable',
  'nig',
  'collective'
] as const;

const pillars = [
  'who',
  'what',
  'proof'
] as const;

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="about">
      <section className="about__hero">
        <Logo className="about__hero-logo" />
        <p className="about__hero-sub">{t('about.subtitle')}</p>
      </section>

      <section>
        <h2 className="about__section-title">{t('about.keyElementsTitle')}</h2>
        <div className="about__grid">
          {keys.map((key) => (
            <div className="about__card" key={key}>
              <div className="about__card-title">{t(`about.items.${key}.title`)}</div>
              <div className="about__card-body">{t(`about.items.${key}.body`)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="about__pillars">
        <h2 className="about__section-title">{t('about.pillarsTitle')}</h2>
        <div className="about__pillars-grid">
          {pillars.map((key) => (
            <div className="about__pillar" key={key}>
              <div className="about__pillar-title">{t(`about.pillars.${key}.title`)}</div>
              <div className="about__pillar-sub">{t(`about.pillars.${key}.sub`)}</div>
              <div className="about__pillar-detail">{t(`about.pillars.${key}.detail`)}</div>
            </div>
          ))}
        </div>
      </section>
      
      <section className="about__credits">
        <h2 className="about__section-title">{t('about.credits.title')}</h2>
        <p dangerouslySetInnerHTML={{ __html: t('about.credits.text') }} />
      </section>
    </div>
  );
}
