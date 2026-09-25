"use client";

import dynamic from "next/dynamic";
import type { FormName } from "@/lib/engine/forms";

// ssr:false must live in a client component. Nothing in the engine (or
// three.js) is evaluated on the server.
const ParticleCanvas = dynamic(() => import("./ParticleCanvas"), { ssr: false });

export default function ParticleStage({ forms, scrollDriven }: { forms: FormName[]; scrollDriven?: boolean }) {
  return <ParticleCanvas forms={forms} scrollDriven={scrollDriven} />;
}
