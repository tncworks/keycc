import ParticleStage from "@/components/ParticleStage";
import Reveal from "@/components/Reveal";
import SmoothScroll from "@/components/SmoothScroll";
import Anatomy from "@/components/sections/Anatomy";
import Connectivity from "@/components/sections/Connectivity";
import Design from "@/components/sections/Design";
import Faq from "@/components/sections/Faq";
import Footer from "@/components/sections/Footer";
import Header from "@/components/sections/Header";
import Hero from "@/components/sections/Hero";
import InTheBox from "@/components/sections/InTheBox";
import Lineup from "@/components/sections/Lineup";
import PinnedLabels from "@/components/sections/PinnedLabels";
import Process from "@/components/sections/Process";
import Reserve from "@/components/sections/Reserve";
import Reviews from "@/components/sections/Reviews";
import Sound from "@/components/sections/Sound";
import Specs from "@/components/sections/Specs";
import Studio from "@/components/sections/Studio";
import Switches from "@/components/sections/Switches";

/** Particle forms in scroll order; each section names its form with data-form. */
const FORMS = ["keyboard", "exploded", "curve", "waveform", "layout", "coil", "wordmark", "field"] as const;

export default function Home() {
  return (
    <>
      <ParticleStage forms={[...FORMS]} scrollDriven />
      <SmoothScroll />
      <Reveal />
      <Header />
      <main id="top">
        <Hero />
        <Anatomy />
        <Switches />
        <Sound />
        <Design />
        <Connectivity />
        <Studio />
        <Process />
        <Lineup />
        <Specs />
        <InTheBox />
        <Reviews />
        <Faq />
        <Reserve />
      </main>
      <PinnedLabels />
      <Footer />
    </>
  );
}
