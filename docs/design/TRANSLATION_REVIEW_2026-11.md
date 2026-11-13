# Translation review sheet — redesign strings (2026-11-11)

Status: **machine-drafted by the implementing agent; NOT reviewed by a native speaker.**
Technical audit run on the whole locale tree (7 languages): 0 missing keys, 0 placeholder mismatches, 0 incomplete plural pairs.
Reviewer: mark each row OK or write the correction. Football register should be informal second person, as elsewhere in the app.

## `evidence:provenance.verifiedLogged`

Context: Scout card / scout player detail, under a trust-verified player. Says the verification covers identity and that only logged matches are shown.

| Language | Text | OK / correction |
|---|---|---|
| en | Trust-verified · logged matches only | |
| de | Vertrauensgeprüft · nur erfasste Spiele | |
| es | Verificado por confianza · solo partidos registrados | |
| fr | Vérifié · matchs enregistrés uniquement | |
| it | Verificato · solo partite registrate | |
| nl | Geverifieerd · alleen geregistreerde wedstrijden | |
| pt | Verificado · apenas jogos registados | |

## `evidence:provenance.profileNotTracking`

Context: Scout player detail header for an unverified player. Must not read as "no data"; it says the fields are profile entries, not match tracking.

| Language | Text | OK / correction |
|---|---|---|
| en | Profile fields · not continuous match tracking | |
| de | Profilangaben · kein durchgehendes Spieltracking | |
| es | Datos del perfil · sin seguimiento continuo de partidos | |
| fr | Champs du profil · pas de suivi continu des matchs | |
| it | Campi del profilo · nessun tracciamento continuo delle partite | |
| nl | Profielvelden · geen doorlopende wedstrijdtracking | |
| pt | Campos do perfil · sem acompanhamento contínuo de jogos | |

## `evidence:provenance.ownSelfEntered`

Context: Player's own Passport header. Tells the owner their profile is self-entered and not analysis verified in a match.

| Language | Text | OK / correction |
|---|---|---|
| en | Your profile · self-entered, not match-verified analysis | |
| de | Dein Profil · selbst eingetragen, keine spielgeprüfte Analyse | |
| es | Tu perfil · introducido por ti, sin análisis verificado en partido | |
| fr | Ton profil · saisi par toi, pas une analyse vérifiée en match | |
| it | Il tuo profilo · inserito da te, non un’analisi verificata in partita | |
| nl | Jouw profiel · zelf ingevuld, geen in de wedstrijd geverifieerde analyse | |
| pt | O teu perfil · introduzido por ti, sem análise verificada em jogo | |

## `evidence:provenance.passportVerified`

Context: Public Passport header, verified identity. "Passport" is the product term and stays untranslated.

| Language | Text | OK / correction |
|---|---|---|
| en | Trust-verified identity · public Passport fields only | |
| de | Vertrauensgeprüfte Identität · nur öffentliche Passport-Felder | |
| es | Identidad verificada · solo campos públicos del Passport | |
| fr | Identité vérifiée · champs publics du Passport uniquement | |
| it | Identità verificata · solo campi pubblici del Passport | |
| nl | Geverifieerde identiteit · alleen openbare Passport-velden | |
| pt | Identidade verificada · apenas campos públicos do Passport | |

## `evidence:provenance.passportPlayerEntered`

Context: Public Passport header, unverified. Privacy/evidence meaning: entered by the player, not verified by match analysis.

| Language | Text | OK / correction |
|---|---|---|
| en | Player-entered Passport · not match-verified analysis | |
| de | Vom Spieler eingetragener Passport · keine spielgeprüfte Analyse | |
| es | Passport introducido por el jugador · sin análisis verificado en partido | |
| fr | Passport saisi par le joueur · pas une analyse vérifiée en match | |
| it | Passport inserito dal giocatore · non un’analisi verificata in partita | |
| nl | Door de speler ingevuld Passport · geen in de wedstrijd geverifieerde analyse | |
| pt | Passport introduzido pelo jogador · sem análise verificada em jogo | |

## `scout:playerCard.profileEvidenceNote`

Context: Discover card. Analysis sample count appears only when it is known.

| Language | Text | OK / correction |
|---|---|---|
| en | Profile fields · analysis count shown only when known | |
| de | Profilangaben · Analysezahl nur, wenn bekannt | |
| es | Datos del perfil · análisis solo si se conocen | |
| fr | Champs du profil · analyses affichées seulement si connues | |
| it | Campi del profilo · analisi mostrate solo se note | |
| nl | Profielvelden · analyses alleen getoond als ze bekend zijn | |
| pt | Campos do perfil · análises mostradas apenas se conhecidas | |

## `scout:playerCard.evidenceFreshness`

Context: Discover card label followed by a value such as "Insufficient".

| Language | Text | OK / correction |
|---|---|---|
| en | Evidence freshness | |
| de | Aktualität der Nachweise | |
| es | Actualidad de la evidencia | |
| fr | Fraîcheur des preuves | |
| it | Attualità delle evidenze | |
| nl | Actualiteit van het bewijs | |
| pt | Atualidade da evidência | |

## `portfolio:homeSegments.today`

Context: Home segmented control, first tab.

| Language | Text | OK / correction |
|---|---|---|
| en | Today | |
| de | Heute | |
| es | Hoy | |
| fr | Aujourd'hui | |
| it | Oggi | |
| nl | Vandaag | |
| pt | Hoje | |

## `portfolio:homeSegments.passport`

Context: Home segmented control, second tab (product term).

| Language | Text | OK / correction |
|---|---|---|
| en | Passport | |
| de | Passport | |
| es | Pasaporte | |
| fr | Passeport | |
| it | Passaporto | |
| nl | Paspoort | |
| pt | Passaporte | |

## `portfolio:homeIdentity.openPassport`

Context: Accessibility label of the identity strip button on Home.

| Language | Text | OK / correction |
|---|---|---|
| en | Open your Passport | |
| de | Passport öffnen | |
| es | Abrir tu Pasaporte | |
| fr | Ouvrir ton Passeport | |
| it | Apri il tuo Passaporto | |
| nl | Open je Paspoort | |
| pt | Abrir o teu Passaporte | |

## Open wording questions

1. German "Vertrauensgeprüft" for "Trust-verified": natural, or should it follow the existing badge wording used elsewhere ("Verifiziert")?
2. "match-verified analysis" has no fixed term. de "spielgeprüfte Analyse", fr "analyse vérifiée en match", es "análisis verificado en partido", it "analisi verificata in partita", nl "in de wedstrijd geverifieerde analyse", pt "análise verificada em jogo" — the meaning to keep: the claim was not checked against match footage.
3. Dutch strings are the longest (up to 71 characters) and wrap to two lines on a 320 px screen; acceptable, but shorter wording is welcome.
4. `portfolio:homeSegments.passport` is deliberately identical to English in German ("Passport" is the product name).

## Not translated at all (pre-existing, English only)

- The Football CV PDF (`footballCvHtml.ts`): section titles, privacy notices and footer.
- The share card image: "Football Passport · profile", stat labels, footer line.
- About 20 `defaultValue` fallbacks elsewhere whose keys exist in the locale files; none leak English at runtime in the audited languages.

Decision needed from the owner: ship exports in English for 5.3, or translate them before release.
