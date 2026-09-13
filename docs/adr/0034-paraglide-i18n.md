# Lab copy goes through Paraglide

TanStack's documented i18n pattern for Start is Paraglide JS. Lab, About, and Host console copy must not live as English literals in the views.

**Decision.** That copy lives in `apps/web/messages/en.json`. Call sites import `{ m as msg }` from `#/paraglide/messages.js` (`m` fails `eslint/id-length`; namespace imports are banned). English is the only locale. Locale strategy is `baseLocale`. URLs stay unprefixed. `html lang` comes from `getLocale()`. Server fetch wraps `paraglideMiddleware`.

Engine ids stay interpolated config, not catalog entries. Lab headings that name the product write hakasebot. Catalog copy may use hakase voice (kickers, nav, document title) without interpolating the stem. GitHub review bodies, Action logs, and core parse errors stay where they are: they are not Lab UI and they must not import the web catalog.

No language switcher. Another locale is a new `messages/{locale}.json` plus strategy, not a rewrite of the call sites.
