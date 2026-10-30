import { Archivo } from "next/font/google";

/**
 * One family for the whole site: Archivo, with its width axis. The condensed cut sets headlines and figures,
 * the normal width sets text. Its Latin subset has no arrow, so arrows are drawn (components/Arrow.tsx).
 */
export const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const fontClasses = archivo.variable;
