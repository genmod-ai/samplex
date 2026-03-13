# Changelog

## [0.1.5](https://github.com/genmod-ai/samplex/compare/samplex-v0.1.4...samplex-v0.1.5) (2026-03-13)


### Bug Fixes

* add 5-minute timeout to login callback server ([faea5b4](https://github.com/genmod-ai/samplex/commit/faea5b46861b634adf19ed621b7baab3e072c082))
* add engines field and prepublishOnly build guard ([6e1c845](https://github.com/genmod-ai/samplex/commit/6e1c845ebd095d2510ed0ca3d37dfd5ea35a713d))
* add non-null assertion to fix TS2532 in login test ([b2b81b8](https://github.com/genmod-ai/samplex/commit/b2b81b8382424f82edc0faadc526ea200bfce79b))
* harden auth, deploy, and config with bug fixes and rename smpx to samplex ([bd6bf4d](https://github.com/genmod-ai/samplex/commit/bd6bf4d481cc11bf2e5b9bc3399197caffd2cd62))
* refactor fetch calls to a common http lib ([5492ed9](https://github.com/genmod-ai/samplex/commit/5492ed9f6ea1dc84bd43d324c2daa75eb56e4d04))
* resolve HTML import type error with allowArbitraryExtensions ([b14e25a](https://github.com/genmod-ai/samplex/commit/b14e25a00732500cb8c142d1f1f809205be42a26))
* show auth URL as fallback when browser fails to open ([0527def](https://github.com/genmod-ai/samplex/commit/0527defbecdf034a57b726899b2f87d48e122038))
* skip symlinks in deploy walkDir to prevent link traversal ([549a630](https://github.com/genmod-ai/samplex/commit/549a630313c7e90733501d390c2d6d057b5873a6))


### Code Refactoring

* migrate bundler from tsup to tsdown ([a2325e7](https://github.com/genmod-ai/samplex/commit/a2325e761a8cb7693d167bcba44a35d2468d40be))
* replace chalk/ora with picocolors/picospinner ([901f73b](https://github.com/genmod-ai/samplex/commit/901f73bddebc42509aba561b9318fbd804686589))
