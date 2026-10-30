import { shell } from "./en/shell";
import { home } from "./en/home";
import { misc } from "./en/misc";
import { ranking } from "./en/ranking";
import { network } from "./en/network";
import { method } from "./en/method";
import { unit } from "./en/unit";
import { recap } from "./en/recap";
import { seo } from "./en/seo";
import { routes } from "./en/routes";
import { shellDe } from "./de/shell";
import { homeDe } from "./de/home";
import { miscDe } from "./de/misc";
import { rankingDe } from "./de/ranking";
import { networkDe } from "./de/network";
import { methodDe } from "./de/method";
import { unitDe } from "./de/unit";
import { recapDe } from "./de/recap";
import { seoDe } from "./de/seo";
import { routesDe } from "./de/routes";

/** Every string on the site. English is the source of truth; German must have exactly the same keys. */
export const EN = { ...shell, ...home, ...misc, ...ranking, ...network, ...method, ...unit, ...recap, ...seo, ...routes };
export type Key = keyof typeof EN;
export const DE: Record<Key, string> = { ...shellDe, ...homeDe, ...miscDe, ...rankingDe, ...networkDe, ...methodDe, ...unitDe, ...recapDe, ...seoDe, ...routesDe };
