import { SiteProvider } from '@/demo/components/SiteProvider'
import { Header, Footer } from '@/demo/components/Header'
import { Hero, FeatureStrip } from '@/demo/components/Hero'
import { Film } from '@/demo/components/Film'
import { World } from '@/demo/components/World'
import { Experience } from '@/demo/components/Experience'
import { Features } from '@/demo/components/Features'
import { Ecosystem, Preview, Faq, FinalCta } from '@/demo/components/Sections'

export default function Page() {
  return (
    <SiteProvider>
      <a className="skip" href="#world">
        Skip to the walkthrough
      </a>
      <Header />
      <main id="top">
        <Hero />
        <FeatureStrip />
        <Film />
        <Features />
        <World />
        <Experience />
        <Ecosystem />
        <Preview />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </SiteProvider>
  )
}
