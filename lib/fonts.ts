import { Barlow, Barlow_Condensed, Roboto_Mono } from "next/font/google";

export const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export const mono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const fontClasses = `${display.variable} ${body.variable} ${mono.variable}`;
