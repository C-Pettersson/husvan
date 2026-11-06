# Husvan

Husvan (husvan.se) är ett verktyg för att förstå vad ett hus kostar över tid.

- **Version 1: köpunderlag.** Ägaren lägger in hus han är intresserad av, ser kostnaden framåt och jämför husen.
- **Senare: underhåll.** När ett hus är köpt blir samma hus utgångspunkt för underhållsplan, påminnelser och kvitton. Inga data flyttas, huset får bara status `PURCHASED`. Planen finns i "Underhållsläge: kontroller och årshjul".
- **Fullversion: hela Sverige.** Version 1 seedar bara Luleå och Boden, men ingen kod får anta det. Allt som skiljer mellan orter är referensdata nycklad på kommunkod, och en kommun utan data ger en flaggad post, inte ett fel.

Fullständig bakgrund, marknadsanalys och resonemang finns i dokumentet:
https://claude.ai/artifact/U5dP4Qjzr9PywekiWPKxp9

## AI först

Husvan används i första hand genom användarens egen AI via MCP. Webbsidan är till för att se data och göra mindre rättningar, men inget får kräva en AI: allt ska också gå att göra för hand på webben.

AI-modellerna blir bättre hela tiden, och Husvan ska bli bättre med dem utan att servern skrivs om. Därför ligger tänkandet hos AI:n och minnet hos servern. Husvan är husets minne: allt som är känt om huset, varifrån det kommer, hur säkert det är och hur bedömningen har ändrats över tid.

| Servern | AI:n |
| --- | --- |
| Lagrar fakta med källa, dokument och säkerhet | Läser dokument och tolkar dem |
| Validerar mot typbiblioteket | Avgör vad som är viktigt och vad som saknas |
| Räknar prognoser efter fasta, spårbara regler | Värderar resultatet, föreslår åtgärder och ger råd |
| Bevarar historiken, inget skrivs över | Jämför, resonerar och förklarar för användaren |

Det får följder för hur servern byggs:

- **Ge underlag, inte slutsatser.** Verktygen returnerar värden med källa, alternativ, osäkerhet och vad som saknas, så att AI:n kan resonera själv. Servern sammanfattar och rangordnar inte åt AI:n utöver det beräkningen kräver.
- **Räkning är deterministisk.** Prognosen följer reglerna i "Kostnadsprognos" och ger samma svar för samma indata. Bedömningar som kräver omdöme hör inte hemma i servern.
- **Verktygen är skrivna för en AI-läsare.** Beskrivningar, felmeddelanden och svar ska räcka för att en modell utan annan kontext ska förstå vad som går att göra och varför något avvisades.
- **Inget låser in dagens modell.** Ingen promptlogik, inga modellspecifika format och inga AI-anrop på serversidan.

### På sikt: AI som förvaltare

När huset är köpt kan en AI-agent sköta det löpande, som en förvaltare: hålla underhållsplanen aktuell, påminna om service, läsa in kvitton och föreslå åtgärder. Datamodellen är redan gjord för det. Allt en agent skriver har källa, påståenden om huset hamnar som utkast tills användaren godkänner, och inget den gör kan radera det som redan är känt.

## Hur verktyget används

Varje användare har sina egna hus och arbetar i sin egen Claude:

1. Användaren lägger till Husvans MCP-server som egen koppling (custom connector) i Claude och loggar in med OAuth. Inloggningen sker med en länk som mejlas till adressen. Ägaren lägger till adresser på `/admin` eller öppnar registreringen där, se "Öppen registrering och missbruk".
2. Användaren laddar upp prospekt, besiktningsprotokoll och energideklaration i chatten.
3. Claude läser dokumenten och skickar ett utkast med hus, komponenter och värden till MCP-servern.
4. Användaren godkänner utkastet. Först då syns något.
5. Användaren frågar om prognoser och jämförelser. En enkel webbsida visar samma data och låter användaren rätta värden.

**Servern tolkar aldrig annonser eller dokument själv.** Den hämtar inga annonser och anropar ingen AI. All tolkning görs av användarens Claude. Servern lagrar, validerar och räknar.

## Stack

Samma stack som `C:\projects\brfjamforelse`, så att kod och vanor kan återanvändas:

| Del | Val |
| --- | --- |
| Ramverk | Next.js 16 App Router, React 19, TypeScript strict. Paketshanterare **yarn**. |
| UI | Material UI 6. |
| Databas | Postgres 16 via Prisma 6. Schemat är `prisma/schema.prisma`, migrationer under `prisma/migrations/`. |
| API för webben | tRPC 11 med React Query och Zod. Inga REST-endpoints för appdata. |
| MCP | Officiella TypeScript-SDK:t v2 (`@modelcontextprotocol/server`), Streamable HTTP, route `src/app/api/mcp/route.ts`. Verktygen ligger i `src/server/mcp/`. |
| Autentisering | **Better Auth** med pluginen `mcp` (OAuth 2.1-auktoriseringsserver i samma app), `cimd`, `jwt`, `magicLink` och `captcha`. Ersätter NextAuth, som inte kan agera auktoriseringsserver. Inloggning med **inloggningslänk via e-post** till adresser på en allowlist (tabellen `allowed_email`, hanteras på `/admin` av en användare med `role = ADMIN`) och, när en admin öppnat registreringen, till nya adresser upp till en gräns per dygn. Better Auths egen registrering med lösenord är avstängd; ett användarkonto skapas första gången en tillåten adress följer en länk. Ägaren seedas som `ADMIN` med ett valfritt lösenord som reserv. Länken skickas över SMTP genom Cloudflare Email Service (`src/server/mail/`), formuläret skyddas av Cloudflare Turnstile. `mcp` och `cimd` är egna paket (`@better-auth/mcp`, `@better-auth/cimd`) byggda på `@better-auth/oauth-provider`; `jwt`, `magicLink` och `captcha` kommer från `better-auth/plugins`. Konfigurationen ligger i `src/lib/auth.ts`. |
| Test | Vitest. |
| Drift | k3s på användarens VPS, styrt från `C:\projects\infra-gitops` med Argo CD, Kustomize, KSOPS och Kargo. `husvan.se` för webben, MCP på `https://husvan.se/api/mcp`. En värd, så att `/.well-known/*` och MCP-sökvägen delar ursprung. Se "Leverans och drift". |
| Lokal körning | `docker compose up -d postgres`, `yarn db:migrate`, `yarn db:seed`, `yarn import:bki`, `yarn import:scb`, `yarn import:bra` och `yarn dev`, som i brfjamforelse. Postgres 16 lyssnar på `localhost:5433` (5432 används av andra projekt); kopiera `.env.example` till `.env` och fyll i hemligheten och den seedade användaren. Compose får senare en valfri app-image för att testa containern; det är inte produktionsmiljön. |

Skillnader mot brfjamforelse: ingen organisationsmodell, kvoter bara för att skydda driften, ingen egen AI-anropning, ingen publik yta utöver startsidan, integritetssidan, verktygssidan och inloggningen. Det som inte behövs byggs inte.

### Leverans och drift

Manifesten följer standarden i infra-gitops (`apps/<app>/base` och `apps/<app>/envs/production`, upptäckta av ApplicationSet:et i `appsets/production.yaml`). Förebilden är `apps/brfjamforelse-se`.

- **Image.** GitHub Actions bygger och pushar `ghcr.io/c-pettersson/husvan` när en semver-tagg pushas, samma workflow som brfjamforelse. Dockerfile enligt brfjamforelse: Node 22 Alpine, flerstegsbygge, `prisma generate` vid bygget, `yarn start` på port 3000.
- **Manifest.** `apps/husvan-se/base` med Deployment (en replika, `envFrom` från Secret `husvan`, `imagePullSecrets: regcred`) och Service på 3000. `apps/husvan-se/envs/production` med Traefik-Ingress för `husvan.se`, `secrets.sops.yaml`, `registry-creds.sops.yaml` och `cloudflare-origin-certificate.sops.yaml`, alla krypterade med SOPS och age enligt `.sops.yaml`. Namnrymden blir `husvan-se-production`.
- **Release.** `kargo/pipelines/husvan-se` med Project, ProjectConfig (`autoPromotionEnabled: false`), Warehouse mot GHCR med semver-filter och en manuell `production`-stage som använder `kargo/base` PromotionTask. Promotion pinnar image-digest i `envs/production/kustomization.yaml`, committar till `main` och låter Argo CD synka. Lägg till appen i `scripts/lib/workloads.mjs` och kör `npm run validate` och `npm test` i infra-gitops.
- **Databas.** Den delade Bitnami-Postgres i namnrymden `default` (`postgres-postgresql.default.svc.cluster.local:5432`), med en egen databas `husvan` och en egen roll. Ett PreSync-jobb i Argo CD (`migrate-job.yaml` i infra-gitops) kör `yarn prisma migrate deploy` och sedan `yarn db:seed:add` från den promoverade imagen före varje synk, så att en tagg både migrerar databasen och lägger in nya typer, profiler och kommuner. Tilläggsläget (`--add-only`, `src/server/library/seedMerge.ts`) ändrar aldrig något som redan är lagrat: nya typer, attributnycklar, profiler och kommuner läggs till, befintliga rader lämnas, och ägaren skapas bara när `SEED_USER_EMAIL` är satt och användaren saknas. Rader som skiljer sig från repot listas i jobbets logg. Den fulla seeden (`yarn db:seed`), där repots värden går före, och importskripten körs för hand via port-forward, som i brfjamforelse. Inget körs vid podstart.
- **Dokumentfiler.** Cloudflare R2 via S3-API:t, med samma `STORAGE_*`-inställningar som brfjamforelse (se `.env.example`). Nycklarna ligger i Secret `husvan`. Ingen PVC för filer.
- **E-post.** Inloggningslänkar skickas över SMTP genom Cloudflare Email Service (`smtp.mx.cloudflare.net`, port 465 med implicit TLS, användarnamn `api_token`, API-token med behörigheten "Email Sending: Edit" som lösenord), avsändare `Husvan <noreply@husvan.se>`. `MAIL_FROM` tar en bar adress eller `Namn <adress>`; visningsnamnet gör att mejlet visas som "Husvan" i inkorgen. Inställningarna `SMTP_HOST`, `SMTP_PORT`, `SMTP_TOKEN` och `MAIL_FROM` ligger i Secret `husvan`. Klienten är nodemailer (`src/server/mail/`). Utan token vägrar produktion att skicka; lokalt skrivs mejlet i terminalen i stället. Rate limiting i Better Auth läser klientens IP från `CF-Connecting-IP` med `X-Forwarded-For` som reserv (`src/lib/clientIp.ts`); utan header, alltså lokalt, används `127.0.0.1`.
- **Turnstile.** `TURNSTILE_SITE_KEY` och `TURNSTILE_SECRET` i Secret `husvan` slår på Cloudflare Turnstile framför inloggningsformuläret (länkbegäran och lösenord). Widgeten är registrerad på `husvan.se` i Cloudflare-panelen med sajtnyckel `0x4AAAAAAFxKVCb25d3sy6Ys`; den läses vid körning, så imagen byggs utan den. I produktion godtar servern bara token med action `login` (`src/lib/turnstile.ts`) och med värdnamn i `TURNSTILE_HOSTNAMES`, som standard värden i `BETTER_AUTH_URL`; lokalt gäller de två kontrollerna bara om `TURNSTILE_HOSTNAMES` är satt, eftersom testnycklarna svarar med `example.com` och utan action. Lokalt används Cloudflares testnycklar från `.env.example`.
- **Framför klustret.** Cloudflare som DNS-proxy med origin-certifikat i Ingress-TLS:en; Traefik litar redan på Cloudflares IP-intervall för vidarebefordrade headers. En WAF-regel släpper bara in Anthropics IP-intervall `160.79.104.0/21` till MCP-routen, token- och JWKS-endpoints och `/.well-known/*`. Under utvecklingen står Cloudflare Access (bara ägarens e-post) framför alla andra sökvägar, alltså webbsidorna och OAuth-inloggningen. Access är tillfälligt: när appen är klar tas det bort, startsidan `/` blir publik och resten av webben skyddas av Better Auths inloggning. Sökvägarna står i "Sökvägar". Samma regler gäller `dev.husvan.se`, tunneln till den lokala appen fram till milstolpe 7. En Tailscale-Ingress som i brfjamforelse är valfri för privat åtkomst förbi Cloudflare.
- **Regel.** Inga direkta ändringar i klustret. Allt går via manifest i infra-gitops, commit, push och reconciliation i Argo CD. Samma regel som i det repots `AGENTS.md`.

**Avgjort i milstolpe 7 (2026-11-02).** Första releasen är taggen `0.1.0`, byggd av workflowet och pinnad med digest i `envs/production/kustomization.yaml` redan i första commiten, så att första synken i Argo CD var en granskad image. Namnrymden är `husvan-se-production`, Secret `husvan` bär de tio miljövariablerna, R2-bucketen heter `husvan-prod` med tomt `STORAGE_PREFIX` (`husvan-dev` är kvar för utveckling). En ändring i Secret når inte en körande pod, eftersom `envFrom` läses vid start och inget startar om podden automatiskt. Databasen `husvan` och rollen `husvan` skapades av ägaren i pgAdmin; lösenordet i klustrets Secret `postgres-postgresql` öppnar inte den delade Postgres. Port-forward lokalt på `5434`, eftersom 5432 och 5433 är upptagna; migrationer, seed och importerna kördes så. `regcred` och Kargos registerkreditiv härleds ur samma GHCR-PAT som övriga appar (`access/credentials/husvan-se`). Runbook i infra-gitops: `apps/husvan-se/README.md`. Vid driftsättningen var WAF-regeln aktiv för `husvan.se` (MCP-routen svarar 403 utanför Anthropics intervall) men Cloudflare Access stod inte framför `husvan.se`; webben skyddas då bara av Better Auths inloggning. Ingressen har en Traefik-`Middleware` med `ipAllowList` för Cloudflares IP-intervall (`cloudflare-ip-allowlist.yaml`, samma som turfzones), annars går WAF-regeln att kringgå genom att anropa noden direkt med `Host: husvan.se`.

### Autentisering: vad Claude kräver

Anthropics krav på en fjärr-MCP-server med OAuth (källa: claude.com/docs/connectors/building/authentication):

- Oautentiserat anrop ska ge `401` med `WWW-Authenticate: Bearer resource_metadata="…"`. En `WWW-Authenticate` på `200` ignoreras. `requireMcpAuth` pekar på den sökvägsförlängda formen `https://husvan.se/.well-known/oauth-protected-resource/api/mcp` (RFC 9728); dokumentet serveras även utan `/api/mcp`.
- Dokumentets `resource` måste vara exakt den URL användaren skriver in i Claude, inklusive sökväg.
- Claude identifierar sig helst med **Client ID Metadata Document** ("Use Claude's published identity"). Det väljs bara om auktoriseringsserverns metadata har både `client_id_metadata_document_supported: true` och `"none"` i `token_endpoint_auth_methods_supported`. Annars faller Claude tillbaka på Dynamic Client Registration, som MCP-specifikationen 2026-07-28 avråder från. Vi kör CIMD och håller DCR avstängt.
- PKCE S256 på varje auktorisering, och `code_challenge_methods_supported: ["S256"]` i metadata.
- Redirect-URI för claude.ai, desktop och mobil: `https://claude.ai/api/mcp/auth_callback`. För Claude Code: loopback på godtycklig port, `localhost` och `127.0.0.1`.
- Refresh tokens roteras. Ogiltig refresh ger `invalid_grant`. Token-endpointen tar `application/x-www-form-urlencoded`.
- Discovery-, registrerings- och token-endpoints måste svara inom 10 sekunder.
- Anthropics utgående trafik kommer från `160.79.104.0/21`.

Better Auths `mcp`-plugin levererar detta: `/oauth2/*`, RFC 8414- och RFC 9728-metadata, JWKS, och `requireMcpAuth` som skyddar MCP-routen. Pluginen är byggd för protokollprofilen 2026-07-28 och rekommenderar `legacy: "reject"` i SDK:t. **Avgjort i milstolpe 0:** claude.ai ansluter till `https://dev.husvan.se/api/mcp` med protokollet 2026-07-28 (`era=modern` i loggen), och MCP-routen kör därför `legacy: "reject"`. Anrop med 2025-protokollet får felet för protokollversion som inte stöds.

Verifierat lokalt med Claudes publicerade klient-id `https://claude.ai/oauth/mcp-oauth-client-metadata` (`token_endpoint_auth_method: none`, redirect `https://claude.ai/api/mcp/auth_callback`): metadata har `client_id_metadata_document_supported: true`, `"none"` bland autentiseringsmetoderna och `code_challenge_methods_supported: ["S256"]`; authorize, inloggning, samtycke, token med PKCE, anrop till `/api/mcp`, roterad refresh och `invalid_grant` för ogiltig refresh fungerar.

**Prisma och Better Auth.** Prisma kan inte lagra `null` i en listkolumn, men Better Auth använder `null` med betydelsen "ingen begränsning" i bland annat `oauthResource.allowedScopes`. Därför har Better Auths `String[]`-fält `@default([])` i schemat, och MCP-resursen deklareras uttryckligen i `resources` med sina `allowedScopes`. Gör samma sak om ett nytt fält ger felet "must not be null".

#### Sökvägar

Utgivaren (issuer) är `https://husvan.se/api/auth`. Underlag för WAF-regeln och Cloudflare Access:

| Sökväg | Anropas av | Skydd |
| --- | --- | --- |
| `/api/mcp` | Anthropics servrar | WAF: bara `160.79.104.0/21` |
| `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/api/mcp` | Anthropics servrar | WAF |
| `/.well-known/oauth-authorization-server/api/auth`, `/.well-known/openid-configuration/api/auth`, `/api/auth/.well-known/openid-configuration` | Anthropics servrar | WAF |
| `/api/auth/oauth2/token`, `/api/auth/jwks` | Anthropics servrar | WAF |
| `/api/auth/oauth2/authorize`, `/login`, `/consent`, `/api/auth/sign-in/email`, `/api/auth/oauth2/consent`, `/api/auth/oauth2/public-client` | Användarens webbläsare | Access, senare Better Auths inloggning |
| `/api/auth/sign-in/magic-link` (begär länk), `/api/auth/magic-link/verify` (länken i mejlet), `/admin`, `/api/trpc/admin.*` | Användarens webbläsare | Access, senare Better Auths inloggning. `verify` öppnas från mejlet och måste nås av användarens webbläsare, inte av Anthropics servrar |
| Allt annat utom `/`, `/privacy` och `/tools` | Användarens webbläsare | Access, senare Better Auths inloggning |

Claude Code ansluter från användarens egen dator, inte från Anthropics intervall, och stängs därför ute av WAF-regeln.

#### Öppen registrering och missbruk

Registreringen är stängd tills en admin öppnar den på `/admin`. Inställningen ligger i tabellen `signup_settings`, inte i Secret, så att den gäller direkt och kan stängas utan omstart. Öppen får en ny adress ett inloggningsmejl och ett konto utan inbjudan (`src/server/users/signup.ts`). Befintliga användare påverkas aldrig av läget.

Cloudflare skyddar bara mot anonym trafik. Det ser vem som skickar en begäran, inte vem mejlet går till, och alla Claudes anrop kommer från Anthropics intervall, så en gräns per IP på MCP-routen skulle strypa alla användare samtidigt. Därför ligger gränserna för inloggade användare i appen:

| Gräns | Värde | Var |
| --- | --- | --- |
| Nya konton | 10 per dygn, ändras på `/admin` | `signup.ts`. Nådd gräns pausar registreringen, och startsidan och inloggningen säger det till alla, inte per adress, så att ingen kan se vilka adresser som har konto. |
| Mejl till nya adresser | 5 per tillåtet nytt konto per dygn | `signup.ts`. Begränsar vad någon kan skicka genom att ta sig förbi Turnstile. Slut på budget pausar registreringen, inget annat. |
| Mejl per mottagare | 5 per timme, 20 per dygn | `signup.ts`, tabellen `login_mail`. Mottagaren lagras som nycklad hash utan `+tagg`, och raderna tas bort efter två dygn. Gäller alla, så en angripare kan tillfälligt stoppa inloggningsmejl till en känd adress. Ägaren har lösenordet som reserv. |
| Begäran per IP | Länk 5 och kod 10 per fem minuter | `rateLimit` i `src/lib/auth.ts`. Better Auth håller den i minnet och slår bara på den i produktion. |
| MCP-anrop per användare | 120 per minut, 5 000 per dygn | `src/server/mcp/rateLimit.ts`, i minnet. Svarar `429`. |
| Lagring per konto | 20 hus, 200 dokument, 1 GB filer, 20 miljoner tecken dokumenttext, 50 000 värden, 100 sparade prognoser per hus | `src/server/users/quota.ts`. Claude får skälet i verktygssvaret. Prognoser utöver gränsen besvaras men sparas inte. Administratörer har inga gränser. |

**Spärra.** Att spärra en adress på `/admin` loggar ut användaren och tar bort Claudes token. Raden i `allowed_email` blir kvar med `blockedAt`, annars skulle öppen registrering släppa in adressen igen. Spärren gäller också länkar och koder som redan skickats (`session.create` i `src/lib/auth.ts`) och Claudes redan utfärdade JWT (`isUserBlocked` i MCP-routen). Husen finns kvar. Ett konto utan rad i `allowed_email` räknas som spärrat, eftersom varje nytt konto får en rad när det skapas.

**Regler i Cloudflare.** De ligger i panelen, inte i något repo, och läggs in innan registreringen öppnas. Två regler, skrivna för Free-planen, som tillåter fem egna regler och en rate limit:

| Regel | Uttryck | Åtgärd |
| --- | --- | --- |
| Egen regel "Inloggning utanför Norden" | `(http.request.uri.path eq "/login" or starts_with(http.request.uri.path, "/api/auth/sign-in/")) and not ip.src.country in {"SE" "NO" "DK" "FI" "IS"}` | Managed Challenge |
| Rate limit "Inloggningsförsök" | `http.request.uri.path in {"/api/auth/sign-in/magic-link" "/api/auth/sign-in/email-otp" "/api/auth/sign-in/email"}` | Block, per IP: 4 begäran på 10 sekunder, i 10 sekunder (Free-planens enda period) |

Utmaningen får aldrig omfatta sökvägarna som anropas av Anthropics servrar, eftersom de inte kan lösa den. Free-planens rate limit är kort; den längre gränsen per IP står appen för (se tabellen ovan).

Medvetet utelämnat: **Bot Fight Mode**, som gäller hela domänen, inte kan undantas med egna regler och kan utmana API-trafik, alltså Claudes anrop till MCP-routen. **Uppladdningens storlek**, eftersom `http.request.body.size` kräver Enterprise och appen redan vägrar på `Content-Length`. **Rate limit på `/api/trpc/*`**, eftersom Free bara har en regel; den läggs till med Pro, som har två.

Access får inte ligga framför `husvan.se` när registreringen är öppen.

**Sökmotorer.** Startsidan, `/tools` och `/privacy` är de enda sidor som ska indexeras. Alla tre har kanonisk adress och står i `sitemap.xml`; startsidan har dessutom egen titel och `WebSite`-data för sajtnamnet. Övriga sidor har `noindex` eller skickar vidare till `/login`. `src/app/robots.ts` och `src/app/sitemap.ts` läser adressen vid körning, eftersom imagen byggs utan `BETTER_AUTH_URL`. Cloudflares hanterade `robots.txt` med reglerna för AI-robotar läggs framför appens fil och styrs i panelen. Regeln "Inloggning utanför Norden" ger Googlebot en utmaning på `/login`, så Search Console kan visa sidan som blockerad; det är väntat, eftersom sidan ändå inte ska indexeras. "Always Use HTTPS" ska vara på i panelen, så att `http://` inte svarar med innehåll.

**Inloggningslänk och OAuth.** När `/oauth2/authorize` saknar session skickas användaren till `/login` med de ursprungliga parametrarna plus en signatur (`sig`, `exp`, `ba_*`). En lösenordsinloggning fortsätter auktoriseringen själv: klienten skickar med den signerade frågan och servern fortsätter i samma anrop. En inloggningslänk kan inte det, eftersom länken öppnas i ett nytt anrop utan frågan. Därför pekar länkens `callbackURL` tillbaka på `/api/auth/oauth2/authorize` med de ursprungliga parametrarna (utan signatur, `prompt` och `max_age`), så att auktoriseringen går vidare till samtycke och tillbaka till Claude när sessionen finns. Regeln ligger i `src/lib/oauthContinue.ts`. Länken måste öppnas i samma webbläsare som startade flödet, eftersom claude.ai kontrollerar `state` mot sin egen session.

Servern hämtar själv JWKS för att verifiera token på MCP-routen. Den hämtningen går till appens interna adress (`getInternalUrl()` i `src/lib/siteUrl.ts`), inte till den publika, eftersom WAF-regeln annars blockerar servern från sin egen `/api/auth/jwks`.

## Datamodell

Principerna, i den ordning de styr schemat:

1. **Fast kärna, dynamiska fakta.** `House` har ägare, adress, kommun, fastighetsbeteckning och status. `Component` har hus, typ, förälder, vad den ersätter och ett namn. Allt annat som Claude läser ut är en `Observation`: nyckel, värde, källa, dokument, säkerhet.
2. **Observationer, inte giltighetstider.** Att prospektet säger 1995 och besiktningen 2001 är inte en förändring över tid utan två påståenden. Därför finns ingen `valid_from`/`valid_to` på värden. Varje observation är en rad med `recordedAt`; det aktuella värdet väljs vid läsning. När något faktiskt byts ut är det komponentens livscykel som ändras, inte värdet.
3. **Bara tillägg.** Ingen rad raderas, och inget påstående skrivs över. Enda undantaget är när användaren raderar sitt konto; se "Radering och export". Ett bättre värde är en ny observation; ett felaktigt får `retractedAt`, och så gör en åtgärd som avfärdas. De enda fält som ändras på plats är `retractedAt`, ändringssetets status, husets kärnfält (adress, kommun, fastighetsbeteckning, status) och ett dokuments `storagePath` när originalfilen laddas upp, med filens `sha256`, namn och typ där de saknas. En utbytt del är en ny `Component` med `replacesId` mot den gamla, och en åtgärd som preciseras, till exempel med en kostnad, är en ny `WorkItem` med `replacesId` mot den gamla. En felregistrerad del rättas med en ny `Component` med `correctsId` mot den gamla, och ett godkänt värde pensioneras genom en `Retraction`-rad i ett utkast; se "Rättningar". Att en rad är ersatt eller rättad härleds, det lagras inte på den gamla raden.
4. **Utkast är riktiga rader.** Allt som skrivs via MCP eller webben pekar på ett `Changeset`. Rader i ett `DRAFT`-ändringsset finns i tabellerna men filtreras bort vid läsning tills användaren godkänner. Godkännande ändrar en status; inget transformeras från JSON till rader. Samma kod renderar utkast och godkända data.
5. **Källa är vem, inte vad.** `ValueSource` är `USER`, `CLAUDE` eller `IMPORT`. Vilken sorts dokument värdet kommer från är `Document.type`. Besiktningen är ett dokument, inte en källa.
6. **Typbibliotek som växer.** `ComponentType.attributeSchema` säger vad Claude ska leta efter men begränsar inte vad som får sparas. Om en nyckel ligger utanför schemat räknas fram vid läsning, det lagras inte.
7. **Inga cacher.** Aktuella värden räknas fram vid läsning. Datamängden är en användares hus.
8. **Spara originalet.** Fil, fulltext och Claudes tolkning sparas oförändrade.

### Aktuellt värde

För varje (komponent, nyckel) bland observationer som inte är återkallade och vars ändringsset är `APPROVED`: `USER` före `CLAUDE` före `IMPORT`, därefter högst `confidence`, därefter senast `recordedAt`. Övriga observationer visas som alternativ med sin källa. Regeln ligger på ett ställe i koden (`currentValue.ts`) och används av både MCP och webben.

Undantag: försäljningens uppgifter (`sale_status`, `asking_price_sek`, `highest_bid_sek`, `highest_bid_date`, `final_price_sek`, `sale_date`, listan `LATEST_WINS_KEYS`) ändras över tid av sin natur. Ett nytt bud ersätter det gamla i stället för att bestrida det, så för dem vinner senast `recordedAt` oavsett källa. Utan undantaget skulle en bevaknings `IMPORT` aldrig synas över Claudes läsning av prospektet.

### Rättningar

`replaces` betyder att delen fysiskt bytts ut: en relinad stam, en ny elcentral. En felregistrering är något annat: en toalett som lades in som badrum, ett garagetak som hamnade på toppnivå, ett namn som blev fel, ett värde som lästes ur fel kolumn. Den rättas utan att någon rad skrivs över:

- **Komponent.** En ny `Component`-rad med `correctsId` mot den felregistrerade, med den typ, det namn och den förälder delen ska ha; det som inte ändras kopieras från den gamla raden. Vid läsning står den nyaste raden i kedjan för delen (`resolveChains` i `src/server/houses/componentChain.ts`): den gamla radens värden, åtgärder och underkomponenter läses som den nyas, inga observationer flyttas eller kopieras, och den gamla raden syns som historik (`corrects` på den nya). Flytt, namnbyte och omtypning av samma del i ett anrop blir en rad. Ersätts någon rad i kedjan med `replaces` är hela delen historia.
- **Värde.** En `Retraction`-rad i utkastet pekar på observationen med ett skäl. När utkastet godkänns döljs värdet vid läsning som ett med `retractedAt`; observationen rörs inte. Webbens egen borttagning sätter `retractedAt` direkt, eftersom användaren gör den själv.
- **Via utkast.** `propose_changes` och `edit_draft` tar `moveComponents`, `renameComponents`, `retypeComponents` och `retireValues`. Bara godkända rader kan rättas; en rad i samma utkast rättas med `edit_draft`, och en del som ett annat öppet utkast redan rättar avvisas, som för byten. Valideringen kontrollerar att den nya föräldern tar typen (`allowedSubcomponents`), att inget flyttas under sig självt, att den nya typen tar delens underkomponenter (flyttas de i samma anrop räknas det) och att värdena finns och är godkända. Värden utanför den nya typens attribut följer med delen och listas som varning, så att Claude kan pensionera dem. Godkännandet är fortfarande bara ett statusbyte.
- **Granskning.** `get_house` med `draftId` visar den rättande raden med `corrects` (gammal typ, namn och förälder) och utkastets `retirements`; webben visar "Före → Efter" och de värden som pensioneras. Varje värde bär sitt id i `get_house`, så att `retireValues` kan peka på det.
- **Prognos på ett utkast.** `forecast` och `compare` tar `draftId` (per hus i `compare`) och räknar som om utkastet vore godkänt; `forecast` ger då `withoutDraft` med det godkända husets summor och sparar inte prognosen. `whatIf` kan då nämna utkastets delar.
- **Källa på delen.** En komponent utan egna värden kan bära `documentId` och `quote` för stället som nämner delen. En åtgärd kan bära `confidence`, så att ett tolkat allvar kan märkas osäkert.

### Huset ett visst datum

Komponenter vars ändringsset godkändes före datumet och som inte ersatts av en komponent godkänd före datumet, med observationer registrerade före datumet. Räcker för "hur såg bedömningen ut före besiktningen". Exakt bitemporalitet är inte ett mål.

### Varför schemat ser ut som det gör

| Val | Alternativ som valdes bort | Skäl |
| --- | --- | --- |
| Observationer med `retractedAt` | `valid_from`/`valid_to` per värde | Blandade ihop när något gällde med när vi fick veta det. Krävde ett partiellt unikt index som Prisma inte kan uttrycka och som förbjöd två aktuella Claude-värden från olika dokument. |
| Utkast som rader i `DRAFT`-ändringsset | Utkastet som JSON i `changeset.proposal` | JSON-varianten krävde en andra datamodell för utkast, egen validering, egen rendering och en transformering vid godkännande. |
| `replacesId` på den nya komponenten | `replaced_on`/`replaced_by` på den gamla | Ett utkast kan då uttrycka ett byte med bara en insert. Den gamla raden rörs aldrig. |
| `correctsId` på en ny komponentrad och `Retraction`-rader för pensionerade värden | Uppdatera `parentId`, `name` och `type` på plats; sätta `retractedAt` vid godkännandet | Samma som för byten: rättningen är en insert i utkastet, den gamla raden rörs aldrig, historiken syns, och godkännandet förblir ett statusbyte. `replaces` kan inte användas, eftersom det betyder fysiskt byte och skulle ge en ny livscykel. |
| Utlämnade utkastrader flyttas till ett eget `REJECTED`-ändringsset | `retractedAt` på komponenter, eller en kolumn `excludedAt` på varje tabell, eller en lista `exclude` som tolkas vid godkännandet | Varje läsning filtrerar redan på ändringssetets status, så ingen läsning behöver ändras och raderna kan aldrig läcka. `retractedAt` behåller betydelsen "gällde och togs tillbaka"; en utlämnad rad har aldrig gällt. Komponenter får ingen ny kolumn, så att "ersatt" förblir det enda som härleds om dem. Raden byter bara beslut, inte innehåll, och den är synlig för ingen när det sker. |
| `LifespanProfile` med kurerade värden och `sources` som JSON | En rad per typ och källa som vägs ihop vid körning | Sammanvägningen är redaktionellt arbete som görs en gång, inte en beräkning per prognos. Råvärdena finns kvar för spårbarhet. |
| `MunicipalTariffChange` och `PriceIndex` som egna tabeller | `tariff_changes` som JSON på kommunen | Typade värden med unika nycklar. En nullbar kommunkolumn i ett unikt index släpper igenom dubbletter i Postgres. |
| `MunicipalTaxRate` och `TaxParameter` per år | Skattesatser som kolumner på kommunen, nationella belopp som konstanter i koden | Takbeloppet för fastighetsavgiften ändras varje år och skattesatserna kan ändras. Med en rad per år och källa går en gammal prognos att förklara, och ett nytt år är en import, inte en release. |
| `LeaseholdPolicy` med `validFrom` | Friköpsandel som kolumn på kommunen | Policyn är ett politiskt beslut som ändras. Historiken behövs för att se vad som gällde, och metoden skiljer sig mellan kommuner (andel av marktaxeringsvärdet, marknadsvärde, inget friköp). |
| `yearMin`/`yearMax` på åtgärder | Ett `year` | Besiktningen säger "inom 1–3 år", aldrig ett årtal. |
| Inga tabeller för händelser och relationer mellan komponenter | Tabellerna med i schemat men oanvända | Oanvända tabeller är otestade gissningar. De läggs till med en migration när underhållsläget byggs. |
| `HouseStatus` som ägarens beslut, `sale_status` som observation | `VIEWING` och `BIDDING` i husets status | Försäljningens läge kommer från annonsen och mäklaren och kan vara fel eller motsägas. Husets status ändras bara av ägaren. |
| `WorkItem.kind` och `retractedAt` | `status` (`PLANNED`, `DISMISSED`, `DONE`) som uppdateras | `kind` behövs för att en bytesåtgärd inte ska räknas två gånger i underhållsskulden. En avfärdad åtgärd återkallas som en observation. Utförda åtgärder hör till underhållsläget. |
| `AreaStatistic` per område och nivå | Områdets värden som observationer på varje hus | Samma siffra gäller många hus och uppdateras årligen. Per hus blir den en kopia som kan bli inaktuell, och nivån (kommun eller DeSO) skulle gå förlorad. |
| `ownerId` på `House` redan nu | Lägga till vid flera användare | Better Auth ger ändå en användartabell, och en backfill senare kostar mer än en kolumn nu. |
| Prisma-namn (`PascalCase`-modeller, `camelCase`-fält, `UPPER_CASE`-enum) | snake_case-SQL | Samma som brfjamforelse. Attributnycklar och typnamn i datan är fortfarande snake_case. |

### Skrivflöde

| Verktyg | Ändringsset | Varför |
| --- | --- | --- |
| `create_house` | Huset skapas direkt. Alla utlästa värden läggs i ett `DRAFT` som returneras tillsammans med `houseId`. | Huset är ankaret som dokument och utkast hänger på. Kärnan är synlig i chatten och lätt att rätta. |
| `save_document` | `APPROVED` direkt. | Ett dokument är bevis, inte ett påstående om huset. Servern tolkar det inte. |
| `set_assumption` | `APPROVED` direkt. | Användarens eget val, uttalat i chatten. |
| `update_listing` | `APPROVED` direkt med källa `IMPORT`, ett eget ändringsset per anrop. | Pris, bud och försäljningsstatus från en bevakning är sifferuppdateringar från annonsen, inte påståenden om huset som behöver granskas. Ett värde lika med det aktuella skrivs inte om. Husets `status` är ett kärnfält och ändras på plats. |
| `propose_changes`, `add_work_item` | `DRAFT` tills `confirm_changes`. | Påståenden om huset som Claude läst ut. |
| `answer_questions` | `DRAFT` tills `confirm_changes`. | Svaren går genom Claude, som kan ha missförstått dem. |
| `edit_draft` | Rader som inte ska med flyttas från utkastet till ett eget `REJECTED`-ändringsset; nya rader läggs i utkastet. | Ett fel modellval ska inte tvinga fram att hela utkastet avvisas och görs om. Se "Rätta ett utkast". |
| Svar på en öppen fråga på webben | `APPROVED` direkt med källa `USER`. | Användaren svarar själv. |
| Rättning på webbsidan | `APPROVED` direkt med källa `USER`. | Användaren gör ändringen själv. Se "Webben". |

`confirm_changes` tar `approve` eller `reject` för hela utkastet. Avslagna rader finns kvar men syns aldrig. Rättningar av godkända rader går genom samma utkast, se "Rättningar". Utkast valideras mot typbiblioteket redan vid `propose_changes`, så att Claude får felet medan den har dokumentet framför sig.

#### Rätta ett utkast

Ett öppet utkast rättas rad för rad med `edit_draft` (`src/server/houses/editDraft.ts`, valideringen `validateDraftEdit` i `changes.ts`), på webben med samma knappar som för godkända rader när utkastet visas på plats:

- **Lämna ut en rad.** `removeComponents`, `removeValues` och `removeWorkItems` tar id:n på rader i utkastet; `get_house` med `draftId` ger utkastets värden sina id:n. Raderna flyttas till ett nytt ändringsset med status `REJECTED` och kommentaren `Left out of draft <id>`, så att de är osynliga på samma sätt som allt annat avslaget, vad användaren än beslutar om resten. En utlämnad komponent tar med sig sina underkomponenter och utkastets värden och åtgärder på dem.
- **Rätta ett värde.** Det felaktiga värdet lämnas ut och det rätta läggs till i samma anrop (samma fält som `propose_changes`). Ett nytt värde ensamt räcker inte: regeln för aktuellt värde låter en senare läsning med lägre `confidence` förlora mot den första.
- **Allt eller inget.** Tillägg valideras som i `propose_changes`, och får inte bygga på något som samma anrop lämnar ut. Ett avgjort utkast kan inte rättas; utkastet låses under rättningen så att ett godkännande inte kan smyga in emellan.

Ordningen i chatten: `create_house`, sedan `save_document` för varje dokument, `type_library` och sist `propose_changes` där varje värde pekar på sitt `documentId`. Ett dokument kräver ett hus, så värden som skickas med `create_house` kan inte peka på något dokument; de är till för det användaren skriver i chatten. Valideringen (`validateChanges` i `src/server/houses/changes.ts`, värdena i `src/server/library/checkValue.ts`):

- **Allt eller inget.** Vid minsta fel skrivs ingenting, och svaret listar alla fel med sökväg, till exempel `components[3] roof_covering.values[0] material: must be one of …`.
- **Typer och värden.** Komponenttypen måste finnas. En nyckel i typens `attributeSchema` eller i husets nycklar (`houseKeys.ts`) kontrolleras mot sin datatyp, sina val, `min`/`max` och sin enhet; utelämnad enhet blir nyckelns. En nyckel utanför schemat sparas med en varning. `absent_features` får bara nämna typer som finns, eller `basement`.
- **Trädet.** `parent` är en `ref` som deklarerats tidigare i samma anrop eller id:t på en befintlig komponent, och förälderns typ måste ha barnets typ i `allowedSubcomponents`. `replaces` måste vara en befintlig komponent som inte redan är ersatt, och en ersatt komponent tar inte emot nya värden.
- **Precisera en åtgärd.** `replaces` på en åtgärd pekar på en befintlig åtgärd som inte redan är ersatt; den nya tar komponenten från den gamla om den inte anger någon. Så prissätter Claude ett besiktningsfel utan kostnad utan att det räknas två gånger. Den gamla döljs vid läsning när den nya syns, och avslås utkastet syns den gamla igen.
- **Ett byte i taget.** En komponent eller åtgärd som ett annat öppet utkast redan ersätter kan inte ersättas i ett nytt; Claude lägger till i det utkastet med `draftId` eller låter användaren avgöra det först. Annars skulle två godkända utkast ge två aktuella rader.
- **Vad ett utkast får peka på.** Godkända komponenter och dokument i samma hus, och komponenterna i det utkast som `draftId` lägger till i. Ett tillägg låser utkastets rad, så att ett godkännande inte kan smita in emellan och göra nya rader synliga ogranskade.
- **Upprepning.** `create_house` vägrar ett hus med samma gatuadress (delen före första kommatecknet, utan hänsyn till skiftläge) eller samma fastighetsbeteckning och returnerar det befintliga id:t. `save_document` med samma `sourceUrl` eller `sha256` returnerar det första dokumentet och fyller i det som saknas på det (`fullText`, `interpretation`, titel, filnamn, datum), så att ett dokument som sparats utan text får den under samma id; inget lagrat skrivs över, och svaret säger i `filled` vad som fylldes.
- **Språk.** Komponenternas `name` och åtgärdernas `description` skrivs på svenska, eftersom användaren läser dem; `quote` är dokumentets egna ord.

Värden från MCP får alltid källa `CLAUDE`. Att återkalla en observation eller avfärda en åtgärd (`retractedAt`) går inte via MCP i version 1; en bättre läsning är en ny observation, en bättre åtgärd ersätter den gamla med `replaces`, och rättningar görs på webbsidan.

### Konventioner

- Attributnycklar och typnamn i datan är engelska, ASCII i snake_case (`installation_year`, `underfloor_heating`).
- Datum i ISO 8601. Belopp i kronor (`Decimal`, suffix `Sek`). Enheter anges explicit (`m2`, `kWh`, `W/m2K`).
- Datatyper för attribut: `text`, `number` (med enhet och valfritt `min`/`max`), `year`, `date`, `boolean` (ja/nej, till exempel `rcd`), `choice` (lista), referens till `actor`, `document` eller `component`. Formen valideras med Zod i `src/server/library/schema.ts`.
- Nycklar som prognosen läser och som därför måste heta lika i alla typer: `installation_year`, `condition` (1–5, 5 är nytt), `area` (m2), `length` (m), `quantity` (antal), `share` (andel 0–1 av husets uppskattade helhet) och `partial_renovation_year`. På huset: `construction_year`, `living_area`, `secondary_area`, `floor_count`, `heating_kwh_per_year`, `electricity_kwh_per_year`, `operating_cost_sek_per_year`.
- Ett `year`-värde får vara ungefärligt: ett spann eller en gräns lagras som mittåret med `confidence` högst 0,7, se "Ungefärligt år" i "Regler för beräkningen".
- Köpdata är observationer på huset, med källa som alla andra värden: `asking_price_sek` (utgångspris), `highest_bid_sek` och `highest_bid_date`, `final_price_sek` (slutpris), `sale_status` (`upcoming`, `bidding`, `closed`), `assessed_value_sek` (taxeringsvärde) och `assessment_year`. `sale_status` gäller försäljningen och är skilt från husets `status`.
- **Pris** i prognos och jämförelse är `final_price_sek` om det finns, annars `highest_bid_sek`, annars `asking_price_sek`. Svaret säger alltid vilket av dem som användes.
- Skatt och tomträtt är observationer på huset: `land_assessed_value_sek` (marktaxeringsvärde), `value_year` (värdeår), `mortgage_deeds_sek` (befintliga pantbrev), `tenure` (`freehold` eller `leasehold`, tomträtt), `ground_lessor` (upplåtare), `ground_rent_sek_per_year` (tomträttsavgäld) och `ground_rent_revision_year` (nästa omreglering).
- Egenskaper som är observationer på huset: `room_count` (antal rum), `floor_count` (våningar), `energy_class` (`A`–`G`), `energy_performance_kwh_per_m2` (primärenergital) och `energy_declaration_year`, `absent_features` (lista med typnamn som huset uttryckligen saknar), `deso_code` (SCB:s demografiska statistikområde) och `police_area_code` (lokalpolisområde).
- **Radon** är observationer på huset: `radon_bq_m3` (årsmedelvärde i inomhusluften, Bq/m³), `radon_measurement_year` och `radon_measured` (`false` bara när ett dokument säger att radon inte är mätt; inte nämnt är okänt). En uppmätt halt över referensnivån 200 Bq/m³ (Strålsäkerhetsmyndigheten) flaggas vid läsning som riskkonstruktionerna, utan kronvärde.
- Husets `status` är `CANDIDATE`, `DECLINED` (avstått), `PURCHASED` eller `SOLD` och är ägarens beslut. Försäljningens läge är observationen `sale_status`, eftersom den kommer från annonsen och mäklaren och kan vara fel.
- Enumvärden är `UPPER_CASE` i databasen och får en översättningsnyckel per värde i webben (`house.status.purchased`).

### Rimlighetskontroller

`get_house` och webbens hussida visar `warnings` (`houseWarnings` i `src/server/houses/checks.ts`): vad i de lagrade värdena som ser fel eller ofullständigt ut, med kod, parametrar och engelsk text; webben översätter koden (`warning.*` i messages). Inget ändras av en varning, och prognosen har sina egna flaggor för det den gissar. Kontrollerna:

| Kod | När |
| --- | --- |
| `bedroom_count_exceeds_rooms` | `bedroom_count` > `room_count` − 1 |
| `conflicting_values` | Två synliga värden på samma nyckel (på huset eller en del) som är tal och skiljer sig mer än 5 % från det aktuella (boarea 111 mot 117 m²) |
| `key_not_in_library`, `house_key_not_in_library` | En nyckel som inte finns i typens `attributeSchema` eller bland husets nycklar; prognosen läser den inte |
| `installation_year_without_evidence` | `installation_year` från `CLAUDE` utan `documentId` och utan `quote` |
| `installation_year_before_type` | `installation_year` före typens `earliestYear` |
| `separate_building_part_at_top_level` | `roof_covering` eller `facade` på toppnivå vars namn hör till ett garage eller en komplementbyggnad, se "Byggnader prissätts genom sina delar" |
| `building_parts_assumed` | `garage` eller `carport` utan `roof_covering` under sig: prognosen antar taket (och garagets fasad) ur byggnadens yta |
| `building_without_parts` | `outbuilding` (utom förråd, vedbod och friggebod, som har egen profil) utan `roof_covering` under sig, eller `garage` och `carport` när ett tak med byggnadens namn ligger på toppnivå: byggnaden kostar inget själv i prognosen |

### Språk

- **Kod på engelska.** Modeller, fält, enumvärden, attributnycklar, typnamn, MCP-verktyg, variabler och kodkommentarer.
- **Gränssnitt på svenska med i18n.** Webbsidans texter är på svenska (`sv`, standard) med stöd för engelska (`en`). Inga visningstexter hårdkodas; allt går via översättningsfiler.
- **Data som växer har etiketter per språk.** Komponenttyper och attribut skapas under drift, så deras etiketter lagras som `{"sv": "...", "en": "..."}`. `sv` krävs, `en` faller tillbaka på `sv`.
- **Svenska facktermer** utan bra engelsk motsvarighet får en svensk förklaring i en kommentar (`propertyDesignation // fastighetsbeteckning`).

### Exempel: typen golvvärme i biblioteket

```json
{
  "type": "underfloor_heating",
  "label": {"sv": "Golvvärme", "en": "Underfloor heating"},
  "category": "heating",
  "attributeSchema": {
    "medium": {
      "label": {"sv": "El eller vatten", "en": "Electric or water"},
      "datatype": "choice",
      "options": {
        "electric": {"sv": "El", "en": "Electric"},
        "water": {"sv": "Vatten", "en": "Water"}
      }
    },
    "installation_year": {"label": {"sv": "Installationsår", "en": "Installation year"}, "datatype": "year"},
    "area": {"label": {"sv": "Yta", "en": "Area"}, "datatype": "number", "unit": "m2"},
    "model_name": {"label": {"sv": "Modellnamn", "en": "Model name"}, "datatype": "text"},
    "installer": {"label": {"sv": "Installatör", "en": "Installer"}, "datatype": "actor"},
    "purchase": {"label": {"sv": "Inköp eller faktura", "en": "Purchase or invoice"}, "datatype": "document"}
  },
  "allowedSubcomponents": ["controller", "shunt_group"]
}
```

### Komponenttyper från start

Biblioteket börjar med de delar som dominerar kostnaden för ett småhus. En typ med `LifespanProfile` (med källa) ingår i prognosen och underhållsskulden. En typ utan profil ger ingen kostnad men visas, filtreras och jämförs; när den får en profil räknas den in utan att några data ändras.

Typerna finns i `prisma/data/componentTypes.mts` och profilerna i `prisma/data/lifespanProfiles.mts`; `yarn db:seed` lägger in dem. Seeden lägger till och skriver över de nycklar den själv definierar men behåller attribut och profiler som skapats under drift. En profil identifieras av typ och `match`. Varje typ med profiler har en med tom `match` för när attributet är okänt, flaggad `profile_default_used`, utom `outbuilding`, vars övriga sorter prissätts genom sina delar. Standardprofilerna för `roof_covering`, `facade`, `underfloor_heating`, `fence` och `retaining_wall` spänner över typens vanliga material med samma källor som materialprofilerna och har ingen ommålning. Av profilerna vars `match` stämmer med komponentens attribut används den som matchar den tidigaste nyckeln i typens `forecastDefaults.profileKeyOrder`, därefter den som matchar flest nycklar; tom `match` är typens standard. Ett relinat gjutjärnsrör följer alltså relining-profilen, eftersom `sewer_pipes` har ordningen `renovation_method`, `material`, `section`. Regeln ligger i `selectProfile` (`src/server/library/profiles.ts`), och `validateLibrary` kräver en ordning för varje typ vars profiler matchar på olika nycklar.

Klimatskal: `foundation`, `roof_covering`, `facade`, `window`, `exterior_door`, `roof_drainage` (hängrännor och stuprör), `roof_safety` (taksäkerhet), `drainage`, `foundation_waterproofing`, `crawl_space_dehumidifier` (avfuktare i krypgrund) och `attic` (vind; profilen är ett nytt lager lösull per m² vindsbjälklag, räknat från `additional_insulation_year`). Installationer: `heat_pump_air_water`, `heat_pump_ground` (berg- eller jordvärmepump, med `collector_type` `borehole`, `surface_ground` eller `lake`), `heat_pump_air_air`, `district_heating_substation`, `electric_boiler`, `electric_radiators` (direktverkande el), `electric_air_heating` (luftburen elvärme), `electric_duct_heater` (elbatteri i ventilationen, delkomponent till `ventilation_ftx`), `pellet_boiler`, `wood_stove`, `chimney`, `hydronic_radiators` (vattenburna radiatorer), `ventilation_ftx`, `ventilation_exhaust` (med `heat_recovery`: F mot FX), `water_heater`, `water_pipes`, `sewer_pipes`, `water_well` (brunn, utan profil som grunden) med delkomponenterna `well_pump` och `water_treatment` (en per filter), `private_sewage` (enskilt avlopp), `electrical_installation`, `electrical_panel`, `underfloor_heating`, `solar_panels` med delkomponenterna `solar_inverter` och `battery_storage` (ett batteri utan solceller läggs på toppnivå), `ev_charger`. Inomhus: `kitchen`, `bathroom` (dusch eller badkar och toalett), `shower_room` (duschrum utan toalett, till exempel vid en bastu; profil på hälften till två tredjedelar av ett badrum), `wc` (toalett utan dusch eller badkar; en WC med dusch är `bathroom`), `laundry_room` (tvättstuga eller annat mindre våtrum, med `floor_drain`), `garage_door`. Kök, badrum, duschrum, WC, tvättstuga och FTX har `partial_renovation_year`, se "Delrenovering". Egenskaper: `outbuilding` (förråd, vedbod, friggebod, uthus, gäststuga, attefallshus, verkstad, växthus, lekstuga eller lusthus efter `building_kind`; förråd, vedbod och friggebod har profil per m², de övriga prissätts genom sina delkomponenter tak, fasad, fönster, dörrar och grund), `sauna` (profil per bastu), `deck` (profil per m² trall), `balcony` (profil per balkong) och, utan profil, `carport` (tak, takavvattning, fasad, fönster, dörr och vind som delkomponenter), `pool`, `sunroom`, `garage` (med `area`, liksom `carport`). Garage och carport får ingen profil för själva byggnaden, eftersom ingen källa anger en livslängd för stommen (prisguiderna ger bara byggkostnader, M84:10 har ingen rad); de prissätts genom sina delar, och ett garage utan tak under sig varnas i `get_house` (`building_parts_assumed`, eller `building_without_parts` för en komplementbyggnad, som inte får några antagna delar). Tomten, kategorin `site`: `driveway` (uppfart, profil per `surface`, även `natural_stone`, och en standardprofil från asfalt till sten för okänd beläggning), `fence` (staket och plank, profil per `material`; trä målas om med samma färgnycklar som fasaden) och `retaining_wall` (stödmur, profil per `material`).

**Byggnader prissätts genom sina delar.** `garage` har `roof_covering`, `facade`, `window` och `exterior_door` som delkomponenter utöver `garage_door`, som `outbuilding` och `carport`. De tre har `forecastDefaults.separateBuilding`, så att delarna under dem varken tar av husets uppskattade tak- och fasadyta eller står in för en del huset självt antas ha. Det gäller också vidbyggda garage och tillbyggnader: deras tak och fasad registreras under byggnaden och får ingen andel av husets. En del utan egen mängd uppskattas ur byggnadens `area` med samma geometri som huset, som ett plan (flaggan `quantity_from_building`); anger byggnaden ingen yta används typens `assumedQuantity`, 30 m² för garage och carport, 12 m² för komplementbyggnad (flaggan `quantity_from_usual_building`), och byggnadens yta blir en öppen fråga. Saknas år används byggnadens eget `installation_year` (flaggan `building_year_used`), och saknas det också räknas åldern som okänd över hela livslängden (`installation_year_unknown`), inte från husets byggår: ett garage byggs ofta senare än huset, och byggåret skulle räkna av delen helt utan grund. Ett vidbyggt garage (`attached`) räknar tre av fyra väggar när fasadytan uppskattas (flaggan `attached_wall_shared`). Ett garage utan tak eller fasad under sig och en carport utan tak får dem antagna (`forecastDefaults.assumeParts`, flaggan `assumed_building_part`, id `assumed:<typ>:building=<byggnadens id>`), så att ett garage inte blir gratis för att underlaget bara nämner det; en carport får inga väggar, eftersom de flesta är öppna. Ett svar på en fråga om en sådan del skapar den under byggnaden. Inget antas där ett tak eller en fasad av samma typ ligger på toppnivå med ett namn som hör till en annan byggnad, eftersom den redan räknas där. Ett tak eller en fasad på toppnivå vars namn säger garage, carport, förråd, uthus, bod, komplementbyggnad, gäststuga, attefallshus, friggebod, lekstuga, växthus, lusthus, ladugård eller verkstad (`looksLikeOtherBuilding` i `src/server/houses/buildings.ts`) delar annars husets uppskattade yta lika med husets eget tak; prognosen flaggar posten `looks_like_other_building` och `get_house` varnar `separate_building_part_at_top_level`, men räknar inte om den, eftersom rättningen är att flytta delen.

**Blandad fasad.** En fasad i flera material är flera `facade`-komponenter, en per material, med var sin `area`. Saknas ytorna anger varje del `share` (0–1) av husets fasadyta, så att den uppskattade ytan fördelas efter andel i stället för lika (se "Andel").

**VA på landet.** Husnycklarna `water_supply` (`municipal`, `private_well`, `shared_well`) och `sewage_system` (`municipal`, `private`, `shared`) säger vad huset har; en egen eller gemensam brunn eller anläggning är också en komponent, så att pump, rening och anläggning kan prognostiseras. Driftposterna `sludge_emptying_cost_sek_per_year` (slamtömning) och `community_association_fee_sek_per_year` (samfällighets- eller vägförening) räknas som prospektets övriga poster. **Risker** utöver riskkonstruktion, äldre el och radon: `private_sewage` med `municipal_assessment` `needs_action` eller `discharge_ban` eller `system_type` `sludge_separator_only`, och `water_well` med `water_test_result` `unfit`. Saknas `water_supply` eller `sewage_system` och ingen komponent svarar på det blir det en öppen fråga (`how: ask`), sorterad med frågorna som avgör en risk, eftersom svaret avgör om hela VA-delen ska prognostiseras.

Fönster registreras styck för styck när underlaget tillåter det, annars som en komponent `window` med `quantity`.

**Nya typer för befintliga hus.** Ett hus läses in mot den dagens bibliotek. När typer tillkommer senare kan dokumenten nämna delar som då saknade typ: en toalett som registrerades som badrum, hängrännor som inte registrerades alls. `get_house` listar därför under `libraryUpdates` de typer som lagts till efter att huset senast lästes (`src/server/houses/libraryUpdates.ts`): tidpunkten är det senaste godkända ändringssetet från Claude, annars när huset skapades, och typer som huset redan har eller som `absent_features` nämner räknas inte. Varje typ säger om den har profil, om prognosen redan antar en sådan del och vilka av husets delar i samma kategori den kan beskriva bättre. `list_houses` ger antalet per hus och webben visar en notis. Servern tolkar inget: Claude läser om dokumenten med `get_document` och föreslår med `propose_changes` (en omtypad del är en ny komponent med `replaces`), eller markerar genomgången med `mark_library_review`, ett godkänt tomt ändringsset från Claude, så att listan räknas från då. Nya attributnycklar på befintliga typer saknar tidsstämpel och listas inte.

Delar som varje hus har får `forecastDefaults.assumeUndocumented`: `roof_covering`, `facade`, `window`, `exterior_door`, `roof_drainage`, `drainage`, `water_pipes`, `sewer_pipes`, `electrical_installation`, `electrical_panel`, `kitchen` och `bathroom`. Nämner underlaget ingen sådan del räknar prognosen med en från byggåret, se "Delar som inte nämns" i "Regler för beräkningen". Uppvärmning och ventilation antas inte, eftersom typen inte går att gissa; däremot antas det som en känd värmekälla förutsätter, `hydronic_radiators` vid vattenburen värme och `chimney` vid kamin eller pelletspanna, och avloppet under plattan vid platta på mark, se "Delar som andra delar förutsätter". Dränering antas inte på plintgrund eller torpargrund (`assumeUnless`), och en antagen dränering runt en platta på mark räknas bara i hög (`assumedOnlyInHigh`).

`facade`, `window` och `exterior_door` har uppgifter om färgen skilda från `installation_year`, eftersom målat trä målas om var 8–15 år men byts mycket mer sällan: `last_painted_year`, `paint_type` (`linseed_oil` linoljefärg, `alkyd_oil` alkydoljefärg, `acrylic` akrylat- eller latexfärg, `slurry_paint` slamfärg, `stain` lasyr), `paint_product`, `paint_colour` och `painted_by`. Ommålningen är en egen återkommande kostnad i profilerna för träpanel (`facade` med `material: wood_panel`), träfönster (`frame_material: wood`) och trädörrar (`exterior_door` med `material: wood`); en del vars material är okänt målas inte om i prognosen. Intervall och kostnader med källor finns i `prisma/data/repaint.mts`, och en källa om ommålning har `about: repaint`. Se "Regler för beräkningen".

### Grunden

`foundation` är en komponent med ett attribut `foundation_type` (`slab_on_ground` platta på mark, `crawl_space` krypgrund, `basement` källare, `plinth` plintgrund, `stone_foundation` torpargrund) och ett attribut för varianten som hör till typen:

| `foundation_type` | Attribut | Värden |
| --- | --- | --- |
| `slab_on_ground` | `slab_insulation` | `below` (under plattan), `above` (ovanpå plattan) |
| `crawl_space` | `crawl_space_ventilation` | `outdoor_air` (uteluftsventilerad), `dehumidified` (avfuktad) |
| `basement` | `basement_wall_insulation` | `exterior` (utvändig), `interior` (invändig) |

Grunden byts inte, så den har ingen `LifespanProfile` och ger inga byten i prognosen. Det som slits är dränering, fuktskydd och avfuktare, som är egna komponenter. Dräneringen prissätts efter grundtypen: vid källare grävs 2–2,5 m, vid platta på mark och krypgrund ungefär 1 m, så profilerna är 4 500–8 000 respektive 3 000–5 500 kr per meter (KlarOffert, NGS AB och Byggahus 2026). Livslängden är densamma, eftersom källorna inte skiljer på den. **Riskkonstruktion** (platta med isolering ovanpå, uteluftsventilerad krypgrund, källare med invändig isolering) räknas fram vid läsning ur typ och variant och lagras inte.

### Elsystem och rör

Delar som ofta är renoverade i omgångar, så att huset har ett byggår men varje del sin egen historia.

| Typ | Attribut |
| --- | --- |
| `electrical_installation` | `wiring` (`cloth_insulated` tygisolerade ledningar, `two_wire` ojordat tvåledarsystem, `grounded` jordat), `installation_year`, `condition`. Delkomponent `electrical_panel`. |
| `electrical_panel` | `panel_type` (`fuses` proppskåp, `circuit_breakers` automatsäkringar), `rcd` (jordfelsbrytare, ja/nej), `main_fuse_a` (huvudsäkring, A), `installation_year`. |
| `water_pipes` | `material` (`copper`, `galvanized_steel`, `pex`, `composite`), `installation_year`, `condition`. |
| `sewer_pipes` | `material` (`cast_iron` gjutjärn, `plastic`, `concrete`, `clay` lera), `section` (`indoor`, `under_slab` under grundplattan, `ground` i mark till förbindelsepunkten eller det enskilda avloppet), `renovation_method` (`replaced`, `relined`), `installation_year`, `condition`. En komponent per sträcka, eftersom de åldras olika. |

Det som har hänt med rören och elen uttrycks med de mekanismer som redan finns, utan en händelsetabell:

- **Filmat eller besiktigat.** Protokollet är ett dokument av typen `PIPE_INSPECTION` eller `ELECTRICAL_INSPECTION`. Det Claude läser ut blir observationer på komponenten, oftast `condition` och `inspected_year`, med dokumentet som källa, och åtgärder från protokollet blir `WorkItem`. Skicket flyttar bytesåret enligt skickregeln.
- **Relinat.** En ny `sewer_pipes` med `replacesId` mot den gamla, `renovation_method: relined` och `installation_year` = året för reliningen. Ett relinat rör har en egen `LifespanProfile` med `match: {"renovation_method": "relined"}`.
- **Bytt.** En ny komponent med `replacesId`, `renovation_method: replaced` och det nya materialet. Det gäller också en ny elcentral, som ersätter den gamla `electrical_panel` men inte ledningarna.

Profilen väljs efter material och metod (`LifespanProfile.match`), eftersom gjutjärn, plast, koppar och relinade rör håller olika länge. Gamla avlopp av gjutjärn, betong och lera filmas först och relinas oftast i stället för att bytas; prognosen gör likadant, se "Billigare förnyelse" i "Regler för beräkningen". **Äldre elsystem** (`cloth_insulated` eller `two_wire`, eller ingen jordfelsbrytare) räknas fram vid läsning och flaggas som riskkonstruktionerna, utan kronvärde utöver byteskostnaden.

### Egenskaper

Det man vill ha i ett hus utöver kostnaden. I version 1 har egenskaperna inget kronvärde: de visas på husets sida, filtrerar huslistan och står med i jämförelsen, men påverkar varken prognos eller underhållsjusterat pris.

| Egenskap | Lagras som |
| --- | --- |
| Pool | `pool` med `pool_type` (`in_ground`, `above_ground`), `heated` och `orientation` |
| Bastu | `sauna` med `heating` (`electric`, `wood`) |
| Terrass, altan, inglasad altan | `deck` med `area`, `glazing` (`open`, `glazed`) och `orientation` |
| Uterum | `sunroom` med `area`, `insulated` och `orientation` |
| Balkong, inglasad balkong | `balcony` med `area`, `glazing` (`open`, `glazed`) och `orientation` |
| Väderstreck | `orientation` (`north`, `north_east`, `east`, `south_east`, `south`, `south_west`, `west`, `north_west`) på `deck`, `balcony`, `sunroom`, `pool` och ett `window` som registreras för sig |
| Kamin | `wood_stove` |
| Luftvärmepump, AC | `heat_pump_air_air` |
| Uppvärmning | Härleds ur värmekomponenterna, lagras inte. Huvudsaklig uppvärmning är den som finns av `heat_pump_ground`, `heat_pump_air_water`, `district_heating_substation`, `electric_boiler`, `electric_radiators`, `electric_air_heating`, `electric_duct_heater` och `pellet_boiler`; `wood_stove` och `heat_pump_air_air` räknas som komplement. `electric_duct_heater` listas bara som huvudsaklig när ingen annan huvudkälla finns; annars är det aggregatets eftervärmare. |
| Garage, dubbelgarage | `garage` med `capacity` (bilplatser), `attached` och `area`; `garage_door`, `roof_covering`, `facade`, `window` och `exterior_door` som delkomponenter, också när garaget är vidbyggt |
| Källare | Härleds ur `foundation_type` = `basement`, lagras inte |
| Antal badrum | Antalet `bathroom`-komponenter, lagras inte. Säger annonsen bara "2 badrum" skapar Claude två badrum utan fler uppgifter. |
| Antal rum, våningar, energiklass | Observationer på huset, se Konventioner |

**Okänt är inte nej.** En egenskap är *ja* när en godkänd komponent av typen finns, *nej* när husets aktuella `absent_features` nämner typen, annars *okänd*. Att ett prospekt inte nämner en pool gör den inte till nej. Filter döljer bara hus där svaret är nej och visar hus med okänt svar för sig.

### Området

Statistik som gäller många hus lagras per område, inte per hus. `AreaStatistic` har `areaLevel` (`NATION`, `MUNICIPALITY`, `POLICE_AREA`, `DESO`), `areaCode` (`SE` för riket), `key`, `year`, `value` och `source`, unikt på (nivå, kod, nyckel, år). Tabellen fylls av ett importskript som körs när ny statistik publiceras, som kommuner och byggkostnadsindex; servern hämtar inget vid körning. Huset kopplas till sina områden med observationerna `deso_code` och `police_area_code`, och kommunen finns redan.

| Fråga | Källa | Nivå |
| --- | --- | --- |
| Brott | Brå, anmälda brott per 100 000 invånare | Kommun |
| Otrygghet och utsatthet | Brå, Nationella trygghetsundersökningen | Polisområde eller lokalpolisområde |
| Vilka som bor där | SCB, befolkning efter ålder, inkomst och utbildning | DeSO |

Varje värde visas bredvid kommunens och rikets, med år och nivå. Ett kommunvärde presenteras aldrig som om det gällde husets närområde. Området har inget kronvärde och markeras inte som bättre eller sämre i jämförelsen.

**Import.** Andelar lagras som decimaltal (`0.168` = 16,8 %) med `unit: "share"`.

| Kommando | Källa | Nycklar |
| --- | --- | --- |
| `yarn import:scb` | SCB:s API (PxWebApi 2.0), tabellerna TAB6574, TAB6684, TAB6685 och TAB6534, per DeSO i Luleå (48) och Boden (18), kommunen och riket, från 2024 | `population_total`, `population_share_age_0_19`, `population_share_age_65_plus`, `median_economic_standard_sek`, `share_low_economic_standard`, `share_high_economic_standard`, `share_post_secondary_education`, `share_post_secondary_3y_plus` |
| `yarn import:bra` | Brå har inget API. Siffrorna förs in för hand i `scripts/data/bra.mts` med källa per värde när Brå publicerar | `reported_crimes_per_100k`, `reported_crimes_count` per kommun och riket; `ntu_unsafe_outdoors_evening_share`, `ntu_worry_burglary_share`, `ntu_victim_personal_crime_share`, `ntu_household_burglary_share`, `ntu_problem_gangs_share`, `ntu_problem_open_drug_dealing_share` per lokalpolisområde och riket |
| `yarn import:bki` | SCB TAB1368, byggkostnadsindex för gruppbyggda småhus, månadsvis från 1975 | `PriceIndex` med serien `bki_small_houses`. Ett pris förs från år X till år Y med medelvärdet för Y delat med medelvärdet för X. |

- **DeSO.** Koderna är DeSO 2025 utan SCB:s suffix (`2580C1140`). De har data från 2024; äldre år finns bara på DeSO 2018-koder och importeras inte. SCB har ingen median för disponibel inkomst per DeSO, så inkomst är median ekonomisk standard (hushållets disponibla inkomst justerad för hushållets storlek).
- **Lokalpolisområde.** Brå namnger lokalpolisområden men ger dem ingen kod. Luleå och Boden delar lokalpolisområdet Luleå-Boden, som lagras som `POLICE_AREA` med koden `lulea-boden`; det är husets `police_area_code`. NTU-året är Brås eget: utsatthet avser året före undersökningen, otrygghet och problem undersökningsåret. Brås kommunskattningar med konfidensintervall importeras inte, eftersom `AreaStatistic` saknar kolumner för intervall.
- **DeSO ur koordinater.** SCB:s WFS svarar på en punkt: `https://geodata.scb.se/geoserver/stat/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=stat:DeSO_2025&outputFormat=application/json&propertyName=desokod&CQL_FILTER=INTERSECTS(sp_geometry,SRID=4326;POINT(<lon> <lat>))`. Koordinaterna måste komma från Claude eller användaren.

## MCP-verktyg i version 1

| Verktyg | Vad det gör | Läser/skriver |
| --- | --- | --- |
| `list_houses` | Alla hus med status, försäljningsstatus, pris, underhållsjusterat pris, nyckeltal och externa id:n. Valfritt filter på egenskaper, där okänt redovisas skilt från nej, och på `externalId` (`booli_id` eller `listing_id`, även i öppna utkast), så att en bevakning hittar huset utan att skapa dubbletter | Läser |
| `get_house` | Allt om ett hus: komponentträd, aktuella värden med källa och alternativ, egenskaper, området, dokument, åtgärder, öppna utkast och rimlighetsvarningar (`warnings`). Valfritt per datum | Läser |
| `get_document` | Ett sparat dokument: metadata, fulltexten i sidor och Claudes tolkning, så att en ny chatt kan läsa besiktningen igen utan ny uppladdning | Läser |
| `get_document_file` | Originalfilen som användaren laddat upp, oförändrad: foton som bild, PDF och text som inbäddad resurs. Servern läser inte filen; Claude tolkar den själv, till exempel ett foto av FTX-aggregatet eller en skadad fasad | Läser |
| `type_library` | Kända komponenttyper och deras attribut, så att Claude vet vad den ska leta efter | Läser |
| `create_house` | Nytt kandidathus. Kärnan sparas direkt, övriga uppgifter returneras som utkast | Skriver |
| `save_document` | Fulltext, metadata och Claudes tolkning. Originalfilen laddas upp via webben | Skriver |
| `propose_changes` | Nya komponenter och observationer, alla med källa, och rättningar av godkända rader: flytt, namnbyte, omtypning och pensionering av värden. Returnerar ett utkast | Skriver utkast |
| `edit_draft` | Rättar ett öppet utkast rad för rad: lämnar ut komponenter, värden och åtgärder och lägger till rader i samma anrop, så att ett fel inte tvingar fram ett nytt utkast | Skriver utkast |
| `confirm_changes` | Godkänner eller avslår ett utkast | Skriver |
| `mark_library_review` | Markerar att dokumenten lästs om mot det aktuella typbiblioteket utan att något tillkom, så att `libraryUpdates` räknas från då | Skriver |
| `add_work_item` | Åtgärd från besiktningen eller eget val | Skriver utkast |
| `set_assumption` | Horisont, startår, ränta, lån, antal låntagare, energipriser, drifttrend, hushållets inkomst, friköpsår | Skriver |
| `update_listing` | Vad annonsen säger nu om ett hus som redan följs: `sale_status`, utgångspris, högsta bud, slutpris och husets `status` när affären är över. Skriver direkt med källa `IMPORT`, eftersom det är sifferuppdateringar från en bevakning och inte påståenden om huset som behöver granskas; senaste värdet per nyckel är det aktuella. Ett eget verktyg i stället för en parameter på `set_assumption`, eftersom antaganden är användarens prognosval i tabellen `Assumption` medan pris och bud är observationer på huset som `pickPrice` läser | Skriver |
| `forecast` | Kostnad per år och post för ett hus, varje post med vad den bygger på. Valfritt `whatIf`: ett scenario som prövas utan att något skrivs, och `draftId`: ett utkast räknat som godkänt, med `withoutDraft` som jämförelse | Läser |
| `open_questions` | Det analysen inte vet än om ett hus och hur mycket varje svar kan flytta underhållsskulden och prognosen, med snabbval och fritt värde per fråga: underlaget för en checklista inför visning | Läser |
| `answer_questions` | Användarens svar på öppna frågor, per fråge-id, som ett utkast | Skriver utkast |
| `compare` | Flera hus sida vid sida: pris, underhållsskuld och underhållsjusterat pris, samma tal per m² boarea (`perLivingM2`, `null` utan `living_area`), prisskillnaden förklarad per komponent, därefter de största skillnaderna med okänt skilt från noll, egenskaper och området. Valfritt `whatIf` per hus och `overrides` | Läser |

Verktygens beskrivningar och svar till Claude är på engelska. Claude svarar ändå användaren på svenska.

Läsverktygen ligger i `src/server/mcp/readTools.ts` och läser genom samma kod som webben: `getHouse` (med `asOf` för huset ett visst datum), regeln för aktuellt värde i `currentValue.ts` och det som härleds vid läsning i `derive.ts` (pris, egenskaper ja/nej/okänt, uppvärmning, antal badrum, riskkonstruktioner, äldre elsystem och radon över referensnivån). Nycklarna på huset finns för Claude i `src/server/library/houseKeys.ts` och returneras av `type_library` tillsammans med komponenttyperna. Verktyget `whoami` från milstolpe 0 är borttaget.

`forecast`, `open_questions` och `compare` ligger i `src/server/mcp/forecastTools.ts`; jämförelsen räknas i `compareHouses` (`src/server/forecast/compare.ts`), som webben också använder. `forecast` sparar varje prognos i `Forecast` och returnerar den förra som `previous`, så att Claude kan säga hur bedömningen ändrats. Engångsantaganden (`overrides`) sparas inte som antaganden och märks `this_forecast`. `compare` sorterar husen efter underhållsjusterat pris och förklarar skillnaden mot det första; ett hus utan kända driftkostnader har `runningCostsKnown: false` och `null` för driften i `largestForecastDifferences` (se "Ojämn redovisning"). Båda tar `whatIf` (se "Tänk om"), och en prognos med `whatIf` sparas inte. `list_houses` visar underhållsskuld och underhållsjusterat pris (typiskt värde).

Skrivverktygen ligger i `src/server/mcp/writeTools.ts` och skriver genom `createHouse`, `saveDocument`, `proposeChanges` (som även `add_work_item` använder), `answerQuestions` (för `answer_questions`), `confirmChangeset`, `setAssumptions` och `updateListing` i `src/server/houses/`. `createHouse` räknar samma fastighetsbeteckning, samma gata i samma kommun eller samma externa id (`booli_id`, `listing_id`, hjälpfunktionerna i `externalId.ts`) som samma hus. Ett utkast returneras med `draftId` och `reviewUrl` (husets sida med `?draft=`), och `get_house` med `draftId` visar utkastets rader märkta `draft: true`, så att Claude kan berätta vad ett godkännande lägger till innan användaren bestämmer sig.

Ett anrop i protokollet 2026-07-28 kräver headrarna `Mcp-Protocol-Version`, `Mcp-Method` (och `Mcp-Name` för `tools/call`) och `params._meta` med `io.modelcontextprotocol/protocolVersion` och `io.modelcontextprotocol/clientCapabilities`. Det behövs för att anropa routen för hand.

Validera allt som skrivs. Fakturor och prospekt kan innehålla dolda instruktioner, så allt innehåll från dokument behandlas som data.

## Webben

Webben läser genom samma kod som MCP-verktygen (`getHouse`, `analyseHouse`, `compareHouses`) via tRPC-routern `house` i `src/server/trpc/routers/house.ts`. Den sparar inga prognoser; det gör verktyget `forecast`.

| Sida | Innehåll |
| --- | --- |
| `/` | Den publika startsidan: vad Husvan räknar och hur det används. Sektionen "När huset är köpt" är en kort förhandsvisning av underhållsläget, märkt "Kommer senare": årshjulet för exempelhuset Videvägen 7 i Boden. Märkningen tas bort och texten stäms av när milstolpe 8–10 är byggda. Sist på sidan står "Om Husvan": varför projektet finns, ambitionen och en länk till brfjamforelse.se. |
| `/privacy` | Publik. Det GDPR artikel 13 kräver: vem som ansvarar, vilka uppgifter, varför, mottagare, lagringstid och rättigheter. Stäm av texten när en leverantör, en loggkälla eller vad som sparas ändras. Kontaktadressen ligger i `src/lib/contact.ts`. |
| `/tools` | Publik. Alla MCP-verktyg på vanligt språk, grupperade efter vad de gör med användarens data: läser bara, blir ett utkast, sparas direkt. Texterna är skrivna för människor och är inte verktygens beskrivningar till Claude. Ett nytt verktyg läggs in i `src/app/tools/toolGroups.ts` och får en text på båda språken; `toolGroups.test.ts` går inte igenom annars, och inte heller om gruppen "läser bara" inte stämmer med `readOnlyHint` eller om ett skrivande verktyg inte har `destructiveHint: false`. |
| `/profile` | Kräver inloggning. Rätta namnet, ladda ner allt och radera kontot; se "Radering och export". |
| `/getting-started` | Kräver inloggning. Hur Husvan läggs till som egen koppling i Claude, med MCP-adressen från `getMcpResource()` och en kopieringsknapp. Menynamnen följer Anthropics hjälpartikel om custom connectors och stäms av mot den när Claude ändrar dem. |
| `/houses` | Husen med pris, underhållsskuld och underhållsjusterat pris med spann. Filter på egenskaper döljer bara hus där svaret är nej och visar hus med okänt svar för sig. 2–6 hus markeras för jämförelse. |
| `/houses/[id]` | Flikar som stannar överst när man skrollar, en i taget (`?tab=`): **Kostnad** (nyckeltal med spann, vad summan saknar eller gissar, kostnad per år som diagram och tabell, eller fördelad över livslängden, underhållsskuld per del, prognosens poster med flaggor, och antagandena), **Inför visningen** (`viewing`, checklistan), **Huset** (`house`: egenskaper och risker, värden, komponenter, åtgärder), **Dokument** och **Området**. Utan `?tab=` öppnas Kostnad, eller Huset när `?draft=` visar ett utkast på plats. |
| `/compare?ids=` | Husen sida vid sida som `compare`: nyckeltal, skillnaden mot det första per del, fel från besiktningen med okänt för obesiktigade hus, största skillnaderna i prognosen, egenskaper, risker och området. |

**Rättningar** (`src/server/houses/correct.ts`) är godkända direkt med källa `USER` och valideras som ett utkast, så att webben inte kan spara det MCP skulle vägra:

- **Värde.** En ny observation på huset eller en komponent, som går före Claudes. Det gamla värdet syns som alternativ.
- **Ta bort ett värde.** `retractedAt` på det aktuella värdet; finns ett annat värde för nyckeln används det.
- **Åtgärd.** En ny åtgärd, eller en ändrad som ersätter den gamla med `replaces`. Att avfärda en åtgärd sätter `retractedAt` på den och på de åtgärder den ersatte, så att ingen av dem räknas igen.
- **Huset.** Status, adress, fastighetsbeteckning och kommun ändras på plats, med samma kontroll mot dubbletter som `create_house` (`isSameHouse`).
- **Antaganden.** Som `set_assumption`, för huset eller alla hus.
- **Utkastrader.** När ett utkast visas på plats (`?draft=`) kan användaren lämna ut en komponent, ett värde eller en åtgärd ur utkastet och rätta ett utkastvärde. Det går genom `editDraft` (se "Rätta ett utkast"); det rättade värdet läggs i utkastet med källa `USER` och godkänns med det, så att utkastet förblir ett beslut.

Nya komponenter skapas inte på webben i version 1; det gör Claude med `propose_changes`. Undantaget är svaret på en öppen fråga om en del som underlaget inte nämner, som lägger till delen med svaret som enda värde.

**Originalfiler** laddas upp till `POST /api/houses/[id]/documents` (`uploadDocument` i `src/server/houses/uploadDocument.ts`) och visas via `GET /api/documents/[id]/file`. PDF, JPEG, PNG, WebP, HEIC och text, högst 25 MB. Filen kopplas till dokumentet med samma `sha256` bland ägarens egna dokument, annars till dokumentet användaren valt (vägras om Claude angett en annan hash eller om dokumentet redan har en fil), annars blir den ett nytt dokument med källa `USER`. Samma fil igen gör ingenting. En hash är unik per hus, inte globalt, eftersom två personer kan ha samma prospekt, och en annan användares kopia syns aldrig i svaret. Bara de tillåtna filtyperna visas i webbläsaren; ett dokument med en annan `mime`, som `save_document` tar emot som den anges, laddas ned i stället. Objektnyckeln är `<STORAGE_PREFIX>houses/<husets id>/<sha256><filändelse>`. Servern läser inte filen; användaren ber Claude tolka den. Signeringen mot R2 (`src/server/storage/s3.ts`) är Signature V4 för hand, testad mot AWS:s exempel.

### Radering och export

**Export** (`GET /api/account/export`, `src/server/users/exportAccount.ts`) ger en ZIP med `data.json` och originalfilerna under `documents/`. En route handler av samma skäl som dokumentfilerna: läsaren är en webbläsare som sparar en fil. Allt som rör användaren följer med, även utkast, avslagna ändringsset och återkallade värden, men inga hemligheter: auth-tabellerna läses med explicit `select`, så att en ny kolumn inte exporteras av misstag. Filerna strömmas en i taget. En fil som lagringen inte kan lämna ut listas i `filesThatCouldNotBeRead`, medan ett fel mitt i en fil avbryter nedladdningen.

**Radering** (`account.delete`, `src/server/users/deleteAccount.ts`) kräver att användaren skriver sin e-postadress. Filerna i R2 tas bort först, sedan alla rader i en transaktion, inklusive adressen på listan över vilka som får logga in och väntande inloggningslänkar. Den ordningen gör att ett fel kan köras om: en fil utan rad går aldrig att hitta igen, men rader utan fil stör bara tills raderingen körs igen.

- **Sista administratören** kan inte radera sig själv. Någon måste kunna sköta listan, och `db:seed:add` skapar ändå ägaren igen vid nästa release.
- **Claude.** Refresh-token och samtycken försvinner, och ett redan utfärdat JWT får `403` eftersom `isUserBlocked` i MCP-routen inte längre hittar användaren.
- **Adressen.** Raden i `allowed_email` tas bort, så med öppen registrering kan adressen skapa ett nytt, tomt konto. En spärrad adress kan inte radera sig, eftersom den inte kan logga in; raden blir kvar med `blockedAt` och begäran går via kontaktadressen. Hashen i `login_mail` tas inte bort vid radering, så att en radering inte nollställer mejlgränsen; den rensas efter två dygn.
- **Ny data med ägare.** En tabell med personuppgifter måste kunna kopplas till en användare och läggas till i både export och radering. `House.owner` och `Assumption.owner` är `Restrict`, så att en rad som glömts stoppar raderingen i stället för att bli kvar utan ägare. Standardantaganden för alla hus (`Assumption` utan hus) har därför `ownerId`; de gällde tidigare alla användare.
- **Utanför Husvan.** Chattar i användarens Claude och redan nedladdade filer når vi inte, och det står på `/privacy`.

## Kostnadsprognos

Per hus och år över vald horisont, i startårets kronor:

1. **Förnyelse enligt livslängd.** Förnyelseår = installationsår + livslängd, justerat efter skick. Kostnad = profilens pris × mängd, uppräknat från prisår till startår med byggkostnadsindex.
2. **Åtgärder från besiktning och prospekt.** Engångsposter, utlagda jämnt över `yearMin`–`yearMax`.
3. **Drift.** Uppvärmning, el, VA, sophämtning, försäkring, sotning. Från prospektet eller energideklarationen, trendat per kommun om användaren valt det.
4. **Regionalt.** Snöröjning och takskottning efter snözon. Saknas energidata: grov skattning av uppvärmning med Fgeo.
5. **Kapitalkostnad (valfri).** Ränta på lånet med användarens ränta, minus ränteavdrag.
6. **Skatter och avgifter.** Fastighetsavgift varje år. Lagfart och pantbrev som engångsposter startåret. Tomträttsavgäld så länge huset står på tomträtt, och friköp om användaren valt ett friköpsår. Kommunalskatt bara om användaren angett hushållets inkomst.

Resultat: kostnad per år och post, summa, snitt per månad och ett spann (låg–hög) som blir bredare ju fler värden som saknas eller är osäkra. Jämförelsen börjar med underhållsjusterat pris (se nedan) och visar sedan de poster som skiljer mest. Prognoser sparas så att man ser hur bedömningen av ett hus ändras.

### Regler för beräkningen

- **Installationsår** är observationen `installation_year` på komponenten (eller nyckeln i typens `forecastDefaults.installationYearKey`, vindens `additional_insulation_year`), annars husets `construction_year`. Saknas båda markeras posten som gissad och spannet breddas till hela livslängdsintervallet.
- **Tidigaste år.** En typ som inte fanns när huset byggdes räknas inte från byggåret: med `forecastDefaults.earliestYear` blir året max(byggår, tidigaste år) och posten flaggas `earliest_year_used`. Är inget år känt alls når spannet inte före det tidigaste året. Åren med källa står i kommentaren vid typen i `componentTypes.mts`: `ev_charger` 2010 (de första serietillverkade elbilarna 2010), `heat_pump_air_air` 1985 (15 000 installerade till 1989), `heat_pump_air_water` 1980 och `heat_pump_ground` 1977 (IVT:s första bergvärmepump), `solar_panels` och `solar_inverter` 2009 (investeringsstödet för småhus juli 2009), `battery_storage` 2016 (SFS 2016:899), `ventilation_ftx` 1975 (40 000 aggregat i småhus 1980), `ventilation_exhaust` 1965, `electric_air_heating` och `electric_duct_heater` 1975, `pellet_boiler` 1990, `crawl_space_dehumidifier` 2000. Ett dokumenterat `installation_year` före typens tidigaste år ändras inte men varnas (se "Rimlighetskontroller").
- **Delrenovering.** `partial_renovation_year` på `kitchen`, `bathroom`, `shower_room`, `wc`, `laundry_room` och `ventilation_ftx` (nya luckor och bänkskivor, nytt porslin och ytskikt utan nytt tätskikt, ny motor i aggregatet) ger delen en andel av en livslängd räknat från renoveringen: bytet kommer det senare av installationsår + livslängd och delrenoveringsår + andel × livslängd, per scenario, och posten flaggas `partial_renovation`. Andelen är en tredjedel, eftersom stomme, vitvaror och tätskikt är lika gamla som förut, och hälften för `ventilation_ftx` (`forecastDefaults.partialRenovationShare`), där motorn står för mer av slitaget. Båda är bedömningar. Hur gammal delen var vid renoveringen räknas inte: en halvvägsregel gav ett kök från 1996 med ommålade luckor 2025 femton år till och lämnade ett FTX-aggregat från 1989 med ny motor 2021 som förbrukat. Räcker delens egen livslängd längre flaggas posten `partial_renovation_no_effect`. `installation_year` ändras inte, och en delrenovering före installationsåret ignoreras.
- **Ungefärligt år.** Ett `year`-värde får anges som spann (`"1999-2004"`, `"1999–2004"`, `{from, to}`) eller som gräns (`"before 2006"`, "äldre än 20 år" uttryckt som året 20 år bakåt, läses som 20 år före det). Det lagras som mittåret med `confidence` högst 0,7 och originalet som `quote` om inget citat finns (`parseApproximateYear` och `normalizeValue` i `checkValue.ts`, anropat från `validateChanges`). Objektformen stoppas i dag av `valueInput`-unionen i `changes.ts`; textformerna går.
- **Mängd** följer profilens `costUnit`: `M2` läser `area`, `LINEAR_M` läser `length`, `EACH` läser `quantity` (standard 1), `HOUSE` är alltid 1. Saknas mängden räknas den ur husets geometri om typen har `quantityFromFootprint` och huset `floor_count`, annars ur typens `quantityPerLivingM2` gånger `living_area`, annars typens `assumedQuantity` (altan 25 m², uppfart 60 m², förråd 12 m², flaggat `quantity_assumed`; en altan vars namn säger entrébro, farstubro, förstukvist eller trappa och inte altan eller terrass får `assumedEntranceQuantity`, 5 m²), annars markeras posten som gissad och syns ändå i prognosen med 0 kr och flaggorna som säger varför. En antagen storlek blir en öppen fråga. Se "Mängd ur boytan".
- **Andel.** En del utan egen mängd kan ange `share` (0–1) av husets uppskattade helhet: en blandad fasad delas i flera `facade` med var sin andel (tegel 0,7, trä 0,3) i stället för lika. Det som andelarna och de angivna ytorna lämnar delas lika mellan de delar som anger inget. Flaggas `quantity_by_share`.
- **Standardprofil.** Saknar komponenten det attribut som skulle välja en smalare profil (uppfart utan `surface`) används typens standardprofil, som för uppfarten spänner från asfalt till sten, och posten flaggas `profile_default_used` med nycklarna. Så kostar en del med okänt material något i stället för inget.
- **Skick** flyttar bytesåret. Standardregel, justerbar per typ i `forecastDefaults`: skick 5 använder `lifespanMaxYears`, 4 och 3 `lifespanTypicalYears`, 2 `lifespanMinYears`, 1 byte inom två år. Utan skick används `lifespanTypicalYears`.
- **Passerad livslängd** ger inte ett byte i det förflutna, och inte heller ett byte genast bara för att delen är gammal. Var bytet hamnar avgör besiktningen, se "Brådska ur besiktningen".
- **Ommålning.** En profil med `repaintMinYears`, `repaintTypicalYears`, `repaintMaxYears`, `repaintCostLowSek` och `repaintCostHighSek` (samma `costUnit` och `priceYear` som bytet) ger en ommålning med jämna mellanrum fram till nästa byte. Intervallet räknas från `last_painted_year`, annars `installation_year`, annars husets `construction_year`. Är `paint_type` känd används typens intervall i `forecastDefaults.repaintByPaintType`, annars profilens. Ett byte nollställer intervallet, eftersom en ny del levereras målad. Ommålning som passerat läggs på startåret och flaggas, som ett byte. Ingen målar det som snart ska bytas: en ommålning inom ett halvt intervall före bytet görs inte (`repaint_skipped`), också när bytet ligger bortom horisonten. Omvänt väntar bytet tills den senaste målningen har gjort sitt, alltså minst ett intervall efter den (`held_by_paint`), utom vid ett allvarligt fel, en bytesåtgärd eller skick 1. Halva intervallet är en bedömning. Underhållsskulden ändras inte av det här.
- **Delar som inte nämns.** Ett hus ska inte bli billigare för att underlaget säger mindre. Saknar huset en godkänd komponent av en typ med `assumeUndocumented` och nämner `absent_features` inte typen, räknar prognosen och underhållsskulden med en sådan del från byggåret, med mängd ur `quantityPerLivingM2`. Delen lagras inte, har id `assumed:<typ>`, märks `assumed: true` i prognosen och listas med sin underhållsskuld i `gaps.assumedParts`. Det är samma princip som "okänt är inte nej" för egenskaperna, men åt andra hållet: för kostnaden är okänt inte noll.
- **Delar som beror på resten av huset.** En typ kan läsa attribut från en annan komponent i huset med `forecastDefaults.context`, attribut mot typ, så att profilen kan matcha på dem; komponentens eget värde går före. Dränering läser `foundation_type` från grunden och prissätts efter den. `assumeUnless` säger när kontexten utesluter en antagen del. Posten flaggas `priced_by_context` med nyckel och värde.
- **Delar som andra delar förutsätter.** `assumeWhenTypes` gör antagandet villkorat av att huset har någon av typerna, och `assumeUnlessParts` upphäver det när en del på toppnivå gör samma jobb (med `where` på valvärden; okänt värde upphäver inte). `hydronic_radiators` antas när huset har `district_heating_substation`, `heat_pump_ground`, `heat_pump_air_water`, `pellet_boiler` eller `electric_boiler` och ingen `underfloor_heating` med `medium: water` på toppnivå (golvvärme under ett badrum är rummets, elgolvvärme i hallen är ingen fördelning) och varken `electric_radiators` eller `electric_air_heating`. `chimney` antas när huset har `wood_stove` eller `pellet_boiler`. `assumeVariants` antar därutöver en del med givna valvärden när kontexten säger det och ingen dokumenterad del har värdena: `sewer_pipes` med `section: under_slab` när grunden är `slab_on_ground`, med egen profil (60 000–300 000 kr per hus) och id `assumed:sewer_pipes:section=under_slab`. Varianten kommer utöver den vanliga antagna delen, så ett hus på platta utan registrerat avlopp får både inomhusrören och rören under plattan; `plainValues` ger den vanliga delen `section: indoor`, så att de två prissätts som var sin sträcka. `assumedOnlyInHigh` säger när en antagen del kanske inte behövs alls: dränering runt en platta på mark. Villaägarna skriver att en platta kan behöva dränering, men ingen källa gör den till en schemalagd förnyelse av en del som underlaget inte nämner. Delen kostar därför bara i hög, flaggas `assumed_only_in_high` och är fortfarande en öppen fråga; nämner underlaget den eller besvaras frågan räknas den som vanligt. Principen att ett hus inte ska bli billigare för att underlaget säger mindre gäller alltså spannet, inte typiskt, för just den här delen.
- **Flera av samma.** En typ med `oneOfSeveral` (badrum) flaggar varje komponent med hur många huset har (`one_of_several`), eftersom en andra del i behov är mindre brådskande medan en annan fungerar. Summorna ändras inte; det är Claude som väger brådskan, och verktygsbeskrivningen säger det.
- **Billigare förnyelse.** En typ kan ha `forecastDefaults.cheaperRenewal`: när komponentens attribut finns i `when` eller är okända förnyas den i låg och typisk med profilen som `match` väljer, till den profilens kostnad och därefter med dess livslängd. Hög byter, eftersom inspektionen kan visa att det billigare inte går. För `sewer_pipes` är det relining av `cast_iron`, `concrete` och `clay`. Relining har en profil för hela villan (50 000–250 000 kr) och en per sträcka, `indoor` 50 000–150 000 kr och `under_slab` 80 000–140 000 kr, så att två sträckor tillsammans hamnar inom Offertas 50 000–300 000 kr för en villa och inte på det dubbla. Okänt material gissas inte ur byggåret, trots att rör från 1980 och senare nästan alltid är plast: plastprofilen har samma livslängd och ett dyrare byte, så en gissning skulle höja skulden utan nytt underlag. Underhållsskulden räknas med samma kostnad per scenario. En del som redan är förnyad så, eller en bytesåtgärd med egen kostnad, förnyas inte billigare.
- **Inspektion före förnyelse.** En typ kan ha `forecastDefaults.inspection` med kostnad och källor, som filmning av avloppet. Inspektionen läggs en gång per hus och typ, året före den första förnyelsen i hög av en del utan `inspected_year`, men tidigast startåret, och kostar lika i alla scenarier. Den ingår inte i underhållsskulden. En besiktningsåtgärd om samma inspektion räknas inte bort.
- **Spann.** Låg använder `lifespanMaxYears` och `costLowSek`, hög använder `lifespanMinYears` och `costHighSek`. Varje post bär en lista över indata som saknas eller har `confidence` under 0,7.
- **Standardantaganden** när användaren inte satt egna: horisont 15 år, startår innevarande år, ingen kapitalkostnad, ingen drifttrend, en låntagare, inget friköp, ingen kommunalskatt.
- **Skatteparametrar** hämtas ur `TaxParameter` för det senaste året till och med startåret och hålls fasta över horisonten, eftersom prognosen räknas i startårets kronor. Samma sak gäller `MunicipalTaxRate`.
- **Fastighetsavgift** är prospektets `property_fee_sek_per_year` när den finns. Annars är den `property_fee_rate` × `assessed_value_sek`, högst `property_fee_cap_sek`, och hus med `value_year` från `property_fee_exempt_from_value_year` och framåt betalar inget de första `property_fee_exempt_years` åren efter värdeåret. Samma regler gäller hus på tomträtt. Saknas taxeringsvärdet används taket och posten markeras som gissad.
- **Lagfart** är `title_stamp_duty_rate` × priset (se "Pris" under Konventioner) plus `title_fee_sek`. **Pantbrev** är `mortgage_deed_stamp_duty_rate` × den del av lånet som befintliga pantbrev inte täcker, plus `mortgage_deed_fee_sek`. Inget nytt pantbrev, ingen avgift. Saknas `mortgage_deeds_sek` räknas med noll och posten markeras som gissad.
- **Tomträttsavgäld** följer `ground_rent_sek_per_year` fram till `ground_rent_revision_year`. Därefter ligger samma belopp kvar men markeras som osäkert, eftersom den nya avgälden inte går att räkna ut i förväg.
- **Friköp** följer kommunens `LeaseholdPolicy` på friköpsdagen. `LAND_ASSESSMENT_SHARE` ger `buyoutFactor` × `land_assessed_value_sek`, plus lagfart på friköpspriset. Avgälden upphör från friköpsåret. Gäller bara när kommunen är upplåtare. Vid `MARKET_VALUE`, annan upplåtare eller saknad policy visas friköpet som okänt med en flagga.
- **Ränteavdrag** är `interest_deduction_rate` på räntan och tomträttsavgälden upp till `interest_deduction_limit_sek` per låntagare, och `interest_deduction_reduced_rate` på resten.
- **Kommunalskatt** är hushållets inkomst × (`municipalRate` + `regionalRate`). Jämförelsen visar bara skillnaden mellan husen, eftersom inkomstskatten betalas oavsett hus. Begravnings- och kyrkoavgift räknas inte med.

### Brådska ur besiktningen

Besiktningsprotokollet är det bästa underlaget för när något måste göras. En överlåtelsebesiktning är okulär, och köparen har en långtgående undersökningsplikt (jordabalken 4 kap. 19 §); det besiktningsmannen inte kunde se täcks i bästa fall av säljarens dolda fel-försäkring. Protokollen säger därför uttryckligen när något kräver mer: "fördjupad undersökning" eller "fortsatt teknisk utredning", en risk i riskanalysen eller ett fel som ska åtgärdas. En del som besiktningen såg utan sådan anmärkning fungerar, hur gammal den än är.

- **Allvar på åtgärder.** `WorkItem.severity` följer protokollets egna nivåer: `MINOR` mindre brist eller notering (Anticimex blå symbol: kräver ingen fördjupad undersökning), `RISK` risk i riskanalysen, `DEFECT` fel eller skada som bör åtgärdas, `SEVERE` allvarligt fel eller akut skada. En rekommenderad fördjupad undersökning är `kind: INVESTIGATION` med allvaret för det den gäller. Claude sätter allvaret ur protokollet och hittar inte på brådska som protokollet inte anger.
- **En del som passerat sin livslängd** placeras efter vad besiktningen sagt om den (`seenByInspection` i `forecast.ts`):

| Besiktningen | Bytet, år efter startåret (låg / typisk / hög) |
| --- | --- |
| Allvarligt fel (`SEVERE`) på delen | 0 / 0 / 0 |
| Huset besiktigat, delen dokumenterad och bara `MINOR` eller fynd utan allvar på den | 30 % / 20 % / 10 % av livslängden, minst 1 |
| Ingen besiktning, en antagen del, en undersökning, ett fel eller en risk på delen | 20 % / 10 % av livslängden / 0 |

  Samma år är också den tidigaste platsen för en del som når sin livslängd senare, så att en yngre del aldrig byts före en äldre i samma läge: el från 1965 och 1967 i besiktigade hus byts båda 2038, inte 2038 och 2027. Posten flaggas `due_soon_seen_ok` eller `due_soon_unjudged`. Det gäller inte en del i skick 1 eller med en bytesåtgärd, som har sitt år ändå.

  Ett fynd utan `severity` betyder att besiktningsmannen såg delen; det räknas som bedömd, och posten flaggas `finding_without_severity` så att läsaren vet att allvaret saknas. Underhållsskulden ändras inte: den räknar den förbrukade delen oavsett när bytet görs.

### Underhållsskuld och underhållsjusterat pris

Prognosen säger vad som händer inom horisonten. För att jämföra köp behövs också ett mått som inte beror på horisonten, så att ett tak som ska bytas år 16 ändå räknas.

- **Underhållsskuld** `U = Σ cᵢ · min(1, aᵢ / Lᵢ) + Σ wⱼ`. `cᵢ` är komponentens bytekostnad i startårets kronor, `aᵢ` dess ålder och `Lᵢ` livslängden enligt reglerna ovan, alltså justerad efter skick. `wⱼ` är kostnaden för varje åtgärd från besiktning och prospekt som inte är återkallad. En åtgärd med `kind: REPLACEMENT` på en komponent ersätter komponentens term, så att inget räknas två gånger. En komponent som målas om får också en term för färgen, med ommålningskostnaden, tiden sedan senaste målning och ommålningsintervallet.
- **Underhållsjusterat pris** = pris + `U`. Det är huvudtalet i jämförelsen.
- **Spann** som för prognosen: låg med `lifespanMaxYears` och `costLowSek`, hög med `lifespanMinYears` och `costHighSek`. Gissade installationsår och mängder breddar spannet på samma sätt.
- **K/T-tal** = pris / `assessed_value_sek`. Taxeringsvärdet ska motsvara 75 % av marknadsvärdet året före taxeringsåret, så talet visas med `assessment_year`.
- **Förklaring av prisskillnad.** Mellan två hus delas skillnaden i underhållsskuld upp per komponenttyp, största först. Skillnader under 20 000 kr slås ihop till "Övrigt". Prisskillnaden plus delarna ger skillnaden i underhållsjusterat pris.
- Grunden ger ingen term i `U`. En riskkonstruktion flaggas i jämförelsen men räknas inte om till kronor.

### Kostnad fördelad över livslängden

Prognosen visar när pengarna går ut. Ett badrum för 200 000 kr som byts år 2 ger en topp det året, fast det håller i 25 år. Den fördelade kostnaden (`annual.ts`) visar i stället vad huset slits per år, oberoende av när något förfaller:

- **Slitage** = Σ `cᵢ / Lᵢ` för varje del med kostnad, plus ommålningskostnaden delad med ommålningsintervallet. `Lᵢ` är hela livslängden utan skickjustering, eftersom det gäller kommande byten. Låg använder `costLowSek` och `lifespanMaxYears`, hög `costHighSek` och `lifespanMinYears`. Förnyas delen billigare i ett scenario används den förnyelsens kostnad och livslängd, som i prognosen.
- **Per månad** = (slitage + drift + ränta) / 12. Driften är prognosens första år utan trend.
- **Åtgärder ingår inte.** De är eftersatt underhåll och räknas i underhållsskulden. Underhållsjusterat pris och fördelad kostnad hör ihop: skulden är det som redan är förbrukat när huset köps, den fördelade kostnaden det som förbrukas därefter.
- Antagna delar ingår, delar utan kostnad inte. Svaren har `annualCost` (`forecast` och `compare`) och `annualCostByPart` (`forecast`).

### Öppna frågor

Inför en visning vill användaren veta vilka få saker som gör bedömningen mycket säkrare: när taket lades om, vilket skick badrummet har, om elcentralen har jordfelsbrytare. Servern räknar ut vad varje svar kan betyda; Claude väljer vilka frågor som går att få svar på vid visningen och skriver listan. Det följer "Ge underlag, inte slutsatser": servern sorterar efter ett belopp den har räknat fram, men avgör inte vad som är viktigt.

`openQuestions` (`src/server/forecast/questions.ts`) räknar om huset en gång per tänkbart svar, en uppgift i taget, med resten av huset som det är. För varje svar ger den underhållsskulden och prognosens summa i typiskt scenario, och `swing` är största minus minsta. Ett svar räknas som användarens eget värde med säkerhet 1. Frågorna:

| Uppgift | Frågas när | Svar som prövas |
| --- | --- | --- |
| Val och ja/nej i typens `attributeSchema` (material, `paint_type`, `foundation_type`, `rcd` …) | Värdet saknas eller har `confidence` under 0,7 | Alla val, eller ja och nej |
| `installation_year` på en del med profil | Som ovan | Husets byggår (annars startåret minus `lifespanMaxYears`), halva typiska livslängden sedan, startåret |
| `condition` | Som ovan | 2–5. Skick 1, byte inom två år, är ett fel som besiktningen anger som åtgärd; prövat skulle det få varje del att se trasig ut. Det går ändå att svara med. |
| `last_painted_year` på en del som målas om | Som ovan | Installationsåret, halva typiska intervallet sedan, startåret |
| `floor_count` på huset | Som ovan | 1, 1,5 och 2 |

En fråga som inget svar flyttar tas bort, utom när svaret avgör en flaggad risk (`decides`): `foundation_type` och variantens attribut på grunden, `wiring` och `rcd`, `municipal_assessment` och `system_type` på ett enskilt avlopp, `water_test_result` på en brunn. Delar som underlaget inte nämner frågas också om, med id `assumed:<typ>` och `documented: false`: de antagna delarna, och typer som andra delar läser som kontext (grunden, som prissätter dräneringen). Svaret prövas som en antagen del med det enda värdet, så att inget annat ändras.

Det som inte går att pröva listas med `swing: null` efter de andra: `water_supply` och `sewage_system` som saknas när ingen brunn eller anläggning är registrerad (husval, sorteras med riskerna), `radon_bq_m3` som saknas, om inte `radon_measured` är `false` (avgör radon), `construction_year` och `living_area` som saknas, ett antal (`quantity`) som är uppskattat eller en mängd som saknas helt, kända driftkostnader som saknas och åtgärder utan kostnad. En yta eller längd uppskattad ur boytan frågas inte om, eftersom ingen mäter ett tak vid en visning. En driftkostnad som räknats fram ur energin, eller som är osäker, får sitt spann över horisonten som `swing`, och frågan gäller den faktiska kostnaden.

Ordningen är efter den största av de två summorna, sedan riskerna och VA-valen, sedan resten. Ett hus utan besiktningsprotokoll har `inspected: false`; ingen fråga ersätter en besiktning. En besvarad fråga försvinner, eftersom listan räknas fram vid läsning och inget sparas.

#### Hur en fråga besvaras

Vid en visning har man telefonen i handen och några minuter per rum. Varje fråga bär därför sitt eget formulär, så att webben och en artifact som Claude bygger frågar likadant:

- **`id`** är `<komponentens id eller house>:<nyckel>`, eller `work_item:<id>` för en åtgärds kostnad. Det gäller så länge frågan är öppen.
- **`how`** är `look` (syns i huset: skick, material, elcentralen, grunden, antal) eller `ask` (frågas mäklaren eller säljaren: årtal, mätningar, kostnader). Det är en standard; Claude får bedöma annorlunda.
- **`options`** är snabbval med värde, säkerhet, en engelsk etikett för Claude och en `meaning` som webben översätter. Val och ja/nej har säkerhet 0,9 (sett), skick 0,8 (bedömt med ögat). Ett årtal erbjuds som originaldelen (byggåret) och som spann bakåt: 0–5, 5–15 och 15–30 år sedan, för målning 0–3, 3–8 och 8–15. Spannet sparas som mittåret med säkerhet 0,7, som är gränsen för osäkert: svaret avgör frågan men räknas som ungefärligt. "Inte mätt" för radon sparas som `radon_measured: false`.
- **`manual`** säger vad som får skrivas in i stället (år, tal med enhet, kronor för en åtgärd), eller `null` när bara snabbvalen gäller.

**Svaren** går genom `answerQuestions` (`src/server/houses/answerQuestions.ts`), som räknar fram frågorna igen och bara tar emot svar på öppna frågor, med ett av snabbvalen eller ett värde när `manual` tillåter det. Svaret hamnar där frågan pekar: ett värde på huset eller en del, en ny komponent för en del med `documented: false` (alla svar om den på samma komponent), eller en åtgärd som ersätts av en med kostnaden. Säkerheten är snabbvalets, eller 1 för ett inskrivet värde, om inte anroparen anger en annan. Allt valideras som ett utkast; vid minsta fel skrivs inget. Från MCP (`answer_questions`) blir svaren ett utkast med källa `CLAUDE`, från webben godkända värden med källa `USER`.

**Webben** visar frågorna som en checklista i fält, med Field Maps och Survey123 som förebild: flikarna "Titta efter" och "Fråga mäklaren", en kort rad per fråga med delen först, frågan under och beloppet till höger, och en rad i taget utfälld med snabbvalen som stora knappar och ett fält för annat värde. Ett svar sparas direkt och nästa rad fälls ut. "Vet inte" lägger frågan åt sidan i den här webbläsaren (`localStorage`), så att den inte är i vägen under visningen men finns kvar. De sex första raderna visas; resten ligger bakom "Visa fler".

**Ångra.** Efter varje svar visas "Sparat" med Ångra, och listan Besvarade har Ångra på varje svar; listan sparas i `localStorage`, så att den finns kvar efter en omladdning. Ett svar från webben får ändringsset med `comment` "Answer to an open question", och att ångra det (`undoAnswer`) sätter ändringssetet till `REJECTED` i efterhand. Det tar med allt svaret lade till, även en ny komponent, som `retractedAt` inte kan, eftersom komponenter inte återkallas. Bara användarens egna svar kan ångras, och inte ett som en senare ändring bygger på, till exempel ett andra svar om delen som det första lade till; då ångras det senare först. Ett ångrat svar finns kvar i tabellerna men syns aldrig, som ett avslaget utkast. Andra värden tas bort som förut, med `retractedAt` på fliken Huset.

**En artifact** är tänkt som det vanliga sättet: Claude bygger checklistan ur `open_questions` för telefonen, användaren svarar under visningen och skickar svaren tillbaka i chatten, och Claude sparar dem med `answer_questions` och visar utkastet för godkännande.

### Hur prognosen är byggd

Koden ligger i `src/server/forecast/`: `plan.ts` räknar fram profil, installationsår, livslängd, mängd och kostnad per komponent en gång, så att prognosen (`forecast.ts`) och underhållsskulden (`debt.ts`) är överens; `running.ts` räknar driften och `run.ts` laddar huset, biblioteket, BKI och antagandena (`buildLibrary` är den rena delen). Allt utom `run.ts` är rena funktioner med tester. Under `fixtures/` ligger fyra av användarens hus som JSON, exporterade från den lokala databasen med `FORECAST_FIXTURES=export yarn vitest run scripts/forecast-fixtures` (samma skript ger med `report` en rapport per hus och del före och efter en ändring); `fixtures.test.ts` räknar dem med repots bibliotek och låser summorna, så att en regel- eller profiländring syns där först. Avgöranden utöver reglerna ovan:

- **Flaggor som koder.** Det prognosen säger om saknade, osäkra eller gissade indata är en kod med parametrar (`flags.ts`). Webben översätter koden; MCP-verktygen skickar den engelska texten, som Claude läser.

- **Tre scenarier.** `low`, `typical` och `high` räknas var för sig hela vägen, eftersom ett byte kan hamna på olika år i dem. `typical` tar medelvärdet av `costLowSek` och `costHighSek`.
- **Gissat installationsår.** Utan `installation_year` och `construction_year` är delen ny i `low`, halvvägs i `typical` och vid `lifespanMinYears` i `high`.
- **Mängd ur boytan.** Med `floor_count` räknas husets yta på marken som `living_area / floor_count`, eller `(living_area + secondary_area) / (floor_count + 1)` när grunden är `basement` och biarean är känd, eftersom källaren är biarea och sällan räknas som våning (flaggan `footprint_includes_secondary_area`; fasadens vägghöjd räknas ändå på våningarna ovan mark), och dess omkrets som 4 × √ytan, ett kompakt rektangulärt hus som i KlarOfferts exempel (100 m² ger ungefär 40 m). `quantityFromFootprint` är en faktor gånger ytan (tak 1,3), omkretsen (dränering 1) eller omkretsen gånger våningarna (fasad 2,7, vägghöjd med gavlar och minus fönster, vald så att ett enplanshus får ungefär 1 m² fasad per m² boyta). Utan `floor_count` används `quantityPerLivingM2` gånger `living_area`. Uppskattningen avser hela huset. Det som typens övriga komponenter inte anger delas lika mellan dem som saknar mängd, så att ett hus vars underlag listar delar utan antal inte blir billigare. Delar under en byggnad med `forecastDefaults.separateBuilding` (garage, komplementbyggnad, carport) räknas inte med i delningen och får ingen andel av huset; de delar på samma sätt det som uppskattas ur byggnadens egen yta, se "Byggnader prissätts genom sina delar". Blir andelen under 1 för `EACH` blir mängden 1 och flaggas; under 0 för yta och längd blir posten utan kostnad.
- **Bytesåtgärd.** En åtgärd med `kind: REPLACEMENT` på en komponent bestämmer komponentens första byte: året mitt i `yearMin`–`yearMax` och åtgärdens kostnad om den finns, annars profilens. Den räknas inte en gång till som åtgärd.
- **Åtgärder utan år eller kostnad.** Utan år läggs de ut efter sitt allvar (`severity`): `SEVERE` på startåret, `DEFECT` på 2 år, `RISK` på 4 och `MINOR` på 5 från startåret; utan allvar på startåret. Utan kostnad räknas de som noll. Alla flaggas.
- **Driften.** Prospektets poster i första hand (`heating_cost_sek_per_year`, `household_electricity_cost_sek_per_year`, `water_sewage_cost_sek_per_year`, `waste_cost_sek_per_year`, `insurance_cost_sek_per_year`, `chimney_sweeping_cost_sek_per_year`, `sludge_emptying_cost_sek_per_year`, `community_association_fee_sek_per_year`), och det som återstår av `operating_cost_sek_per_year` som en egen post. `property_fee_sek_per_year` är alltid en egen post. Uppvärmningen räknas fram bara när prospektet varken har en kostnad för den eller en total: `heating_kwh_per_year` gånger elpriset eller fjärrvärmepriset efter huvudsaklig uppvärmning, annars primärenergitalet gånger `living_area` gånger Fgeo delat med viktningsfaktorn (BBR 29: el 1,8, fjärrvärme 0,7). Spannet är 0 för säkra värden, ±20 % under `confidence` 0,7, ±15 % (±30 % om osäkert) för energi gånger pris och ±30 % för skattningen ur primärenergitalet.
- **Energipriser.** Användarens antagande, annars kommunens pris i `prisma/data/municipalities.mts`. Pellets har inget pris.
- **Drifttrend.** Medelvärdet av kommunens årliga förändringar i Nils Holgersson per kategori, ränta på ränta. VA, sophämtning, el (bara nätavgiften) och fjärrvärme trendas. Förändringarna är nominella medan prognosen är i startårets kronor, så trenden överdriver något.
- **Kapitalkostnad.** `interest_rate` gånger `loan_sek` varje år, utan amortering. Ränta utan lån flaggas och ger ingen kostnad.
- **Index.** Profilens pris förs från `priceYear` till startåret med årsmedel av BKI. Ett startår efter senaste data använder senaste året (`priceIndexYear` i svaret).
- **Ordning per år.** Varje scenario är en egen väg med egna bytesår, så ett enskilt år kan låg eller hög hamna på fel sida om typisk. Summorna är i ordning. En enskild post kan ändå få ett spann i fel ordning: ett byte i typisk nollställer ommålningen, medan låg utan byte målar om en gång till, så ommålningen blir dyrare i låg än i typisk. Posten flaggas `scenarios_cross`, och verktygsbeskrivningen säger det.
- **Underlag per post.** Varje post bär `basis`: `documented` (eget installationsår), `construction_year` (byggåret står in), `unknown_year` (inget av dem; spannet täcker hela livslängden), `assumed` (antagen del), och för driften `stated`, `from_energy` eller `estimated`. `gaps.parts` och `gaps.documentedParts` ger antalet delar med profil, så att `partsWithoutInstallationYear` och `assumedParts` kan läsas som en andel.
- **Luckor.** Svaret har `gaps` bredvid summorna: om det finns ett besiktningsprotokoll (`inspected`), åtgärder utan kostnad, antagna delar (`assumedParts`), dokumenterade delar med husets byggår som installationsår och delar utan kostnad, så att Claude säger vad summan saknar.
- **Ojämn redovisning.** Ett hus med besiktningsprotokoll har en lista med fel; ett hus utan har okända fel, inte inga. `compare` visar därför `inspectionFindings` per komponenttyp och hus, med `null` för ett hus utan protokoll, och beskrivningen säger åt Claude att ett fel i ett hus kan finnas också i ett obesiktigat. Felen läggs inte på det obesiktigade huset i kronor, eftersom det inte finns underlag för hur mycket en besiktning brukar hitta. Samma princip styr `largestForecastDifferences` (`differences.ts`): varje cell har `sek` och `basis`. Okänt är `null` och räknas inte i spridningen: en typ som underlaget inte nämner (`not_documented`), en driftpost som ligger i prospektets totala driftkostnad (`in_operating_total`) eller är okänd (`unknown`), och åtgärder i ett hus utan protokoll (`not_inspected`). Säger `absent_features` att huset saknar typen är cellen 0 med `absent`. En känd cell bär det svagaste underlaget bland typens delar. Uppvärmning och hushållsel jämförs som en post, `running:energy`, eftersom ett eluppvärmt hus har värmen på elräkningen och annars ser billigare ut på fel rad.
- **Tänk om.** `forecast` och `compare` tar `whatIf` (`whatIf.ts`): värden på huset eller en del, `assumed:<typ>` för en del som underlaget inte nämner, och delar som lämnas utanför med sina underdelar. Det läggs på huset som det lästs, innan analysen, som användarens egna värden med säkerhet 1; inget skrivs, och en prognos med `whatIf` sparas inte. Så kan Claude visa hur känslig bedömningen är för en uppgift, till exempel om fasaden byttes 2013 eller om en WC inte räknas som badrum, och `propose_changes` sparar det användaren bekräftar. Öppna frågor prövar sina svar på samma sätt. Ett id som inte finns i huset ger fel och ingenting läggs på.
- **Tomträttsavgäld** är en driftpost i prognosen: `ground_rent_sek_per_year` varje år, och från `ground_rent_revision_year` samma belopp med spannet ±20 % och flaggan `ground_rent_revised`. Saknas omregleringsåret är posten osäker hela horisonten (`ground_rent_no_revision_year`). Den trendas inte och ger ingen öppen fråga av sin osäkerhet, eftersom inget svar kan avgöra den nya avgälden.
- **Inte med ännu.** Snöröjning och takskottning efter snözon, ställning vid fasadmålning, och skatter och avgifter utöver prospektets fastighetsavgift och tomträttsavgälden (fastighetsavgift ur taxeringsvärdet, lagfart, pantbrev, friköp, ränteavdrag och kommunalskatt). Verktygen säger det i `notModelled`.

## Underhållsläge: kontroller och årshjul

Nästa steg efter köpunderlaget. Planerat 2026-11-02 ur funktionsspecen "Husvan – funktionsspec: kontroller och årshjul" och anpassat till principerna ovan; avvikelserna från specen står under "Anpassningar". Ett köpt hus får återkommande kontroller per del och ett årshjul som visar när de ska göras, efter husets delar, skick och ort. Det gör Husvan användbart varje år efter köpet.

Förebilden för strukturen är Villaägarnas Min Villa (testad med Yxgränd 6 den 2 november 2026): bra på rutinen, men den vet inget om det enskilda huset och föreslår guider för mansardtak och källare åt ett hus med sadeltak utan källare. Husvan har redan delarna med årtal, källa och skick, besiktningens anmärkningar med citat, prognosen och kommunen. Texterna är Husvans egna; Min Villa är förebild för strukturen, inte för innehållet.

**Mål.** Varje hus får kontrollschema och årshjul utan att användaren skriver in något. Ett kontrollresultat kan skapa en åtgärd eller ändra en dels skick, och därmed prognosen. Kontrollerna når användaren utanför Husvan via kalender och användarens egen AI. **Inte i första versionen:** instruktionsfilmer och bildbibliotek, hantverkarförmedling, trädgård, väderdata dag för dag (säsongerna räknas på normalår).

**Tre lägen, samma data.** Husets `status` styr vad som visas: en kandidat får en förhandsvisning av första årets kontroller och åtgärder, också i jämförelsen; ett köpt hus får årshjulet med besiktningens anmärkningar inlagda och loggen; en långvarig ägare får påminnelser och en logg som blir husets historik vid försäljning. Exempel: Yxgränd 6 köps. I april påminner hjulet om att smältvattnet från stuprören ska ledas bort från grunden, som besiktningen anmärkte på. I maj kommer fuktkontrollen av syllen, tätare än normalt eftersom plattan har isoleringen ovanpå.

### Anpassningar

Specen föreslog sex tabeller där fält uppdateras på plats (`next_due`, `status`, `planned_month`) och nya kolumner på huset. Det bryter mot "Bara tillägg" och "Inga cacher". Anpassningen räknar fram det som går att räkna fram och sparar bara nya fakta och användarens egna val:

| Specen | Husvan | Skäl |
| --- | --- | --- |
| `house_check` med `next_due`, `status` och `planned_month` | Kontrollerna räknas fram vid läsning ur komponentträdet och mallarna (`planChecks`, ren funktion som `planComponents`). Lagras inte. | Inga cacher. En kontroll har identiteten `check:<komponent-id eller house>:<mallnyckel>`, som frågorna i `open_questions`. Att den är pensionerad härleds ur `replacesId`, riskintervallet ur `risks()`. |
| `check_log` | `CheckLog`, bara tillägg, med `changesetId` | Som observationer och åtgärder. |
| `planned_month` på kontrollen; `climate_zone_override`, `diy_level` och kalendertoken på huset | Användarens val per post i hjulet är `WheelSetting`-rader (nyckel och värde per post, nyaste godkända vinner, som `Assumption`). `diy_level` och `climate_zone` är `Assumption`-nycklar. Kalendertoken är en egen tabell med `revokedAt`. | Husets kärna växer inte med inställningar, och inget uppdateras på plats. |
| `climate_zone` och `municipality_zone` | `Municipality.climateZone` och `SeasonWindow` per zon och säsongsankare | Kommunen bär redan ortens referensdata (Fgeo, snölast). En kommun utan zon får ett flaggat standardfönster, inte ett fel. |
| Skick i fyra steg med en fast andel per typ | `condition` 1–5 och `conditionRule`, som redan finns | En skickskala i prognosen. En anmärkning sänker ett steg; ett mätvärde över mallens gräns sätter mallens `remarkCondition`. |
| `propose_check_templates` som utkast | Mallarna är biblioteksdata i `prisma/data/checkTemplates.mts`, skrivna av Claude med källa per mall och granskade i en PR innan `yarn db:seed` lägger in dem | Som livslängdsprofilerna: redaktionellt arbete med versionshistorik i git. Beslutet "Claude skriver, användaren godkänner" står kvar; godkännandet är PR:en. Ett utkastflöde för mallar kan läggas till senare, `CheckTemplate` har `changesetId` för det. |
| `move_wheel_item` som utkast | `adjust_wheel_item`, godkänt direkt med källa `USER` | Användarens eget val uttalat i chatten, som `set_assumption`. Tar också paus och eget intervall. |
| `log_check` som utkast | Utkast från MCP, direkt från webben | Som `answer_questions`: Claude kan ha missförstått ett foto eller ett svar. |
| Åtgärd får `season_anchor` och `planned_year` | `WorkItem.seasonAnchor`; året är `yearMin`–`yearMax` som förut, och användarens val av år och månad är en `WheelSetting` | Inget dubbelt årsfält. |
| Inloggning med magisk länk nu, BankID senare | Ingen ändring | Hör till flera användare, som ligger utanför version 1. En användare med lösenord räcker. |
| Framgångsmått som andelar | Inga mått | En användare. Signalerna i specen (kontroller som aldrig loggas, poster som flyttas åt samma håll) går att läsa ur `CheckLog` och `WheelSetting` när de behövs. |

Tabellerna läggs till med en migration när milstolpe 8 börjar, inte förr (se "Varför schemat ser ut som det gör").

### Kontrollmall

`CheckTemplate` hör till typbiblioteket och versioneras. En mall hör till en komponenttyp och kan avgränsas till varianter, eller är husgemensam.

| Fält | Innehåll |
| --- | --- |
| `key` | snake_case, unik, t.ex. `roof_sheet_metal_after_snowmelt` |
| `componentType` | Typen, eller null för husgemensamma mallar (brandvarnare, radonmätning, energideklaration) |
| `match` | Attributvärden som avgränsar, som `LifespanProfile.match`: `{"material": "sheet_metal"}`. Val och ja/nej. |
| `intervalMonths` | Månader mellan kontrollerna |
| `riskIntervalMonths`, `whyRisk` | Kortare intervall när `risks()` flaggar delen, och raden som säger varför (`{sv, en}`). Takets snökontroll räknas som risk när kommunens `groundSnowLoadKnM2` är minst 2,5. |
| `seasonAnchor`, `fixedMonth` | `AFTER_SNOWMELT`, `DRY_SEASON`, `AFTER_LEAF_FALL`, `BEFORE_FROST`, `BEFORE_HEATING_SEASON`, `WINTER_SNOW`, `FIXED_MONTH` (med månad 1–12), `ANY` |
| `difficulty` | `EASY`, `MEDIUM`, `HARD` |
| `performer` | `SELF`, `CONTRACTOR`, `LICENSED_ELECTRICIAN` (auktoriserad elinstallatör), `LICENSED_WET_ROOM` (GVK eller BKR) |
| `rule`, `authority` | `LAW`, `INSURANCE` eller `RECOMMENDATION`, och vem som bestämmer (MSB, Boverket, Strålsäkerhetsmyndigheten, Elsäkerhetsverket, GVK …) |
| `title`, `lookFor`, `howTo`, `tools` | `{sv, en}`; `lookFor`, `howTo` och `tools` som listor |
| `measurements` | Nyckel → etikett, datatyp, enhet, `remarkAbove`/`remarkBelow` och valfri `observationKey`: fuktkvot i procent med gräns 17, radonhalt som skrivs till `radon_bq_m3` |
| `anchorKey` | Observationsnyckel som räknas som senast gjord när logg saknas: `inspected_year`, `radon_measurement_year`, `energy_declaration_year`, `last_painted_year` |
| `remarkCondition` | Skicket en anmärkning ger; utan värde ett steg ner |
| `version`, `sources` | Heltal som höjs när texten ändras, och källor som profilernas. Äldre texter finns i git. |
| `houseId`, `changesetId` | Null för biblioteket. Satta för användarens egna poster, se "Egna poster". |

### Generering

`planChecks` i `src/server/checks/` är ren och testad, som prognosen:

1. Varje synlig komponent (godkänd, inte ersatt) och varje antagen del (`assumed:<typ>`) får kontrollerna vars mall matchar typ och `match`. Husgemensamma mallar ges huset. En antagen del flaggas, som i prognosen.
2. En typ med mallar som huset varken har, har som nej (`absent_features`) eller antar blir en fråga i `open_questions` med `decides: "check"`: finns eldstad, finns pool. Ja skapar delen som ett svar om en odokumenterad del gör i dag; nej lägger typen till `absent_features` (sammanslaget med listans nuvarande värde). Frågorna sorteras efter kronfrågorna och riskerna.
3. Delar som `risks()` flaggar får `riskIntervalMonths` och raden `whyRisk`.
4. En ersatt komponent för inte sina kontroller vidare; den nya får sina egna. Loggen på den gamla finns kvar i historiken.
5. Senast gjord är den senaste `CheckLog`-raden med `OK` eller `REMARK`, annars observationen i `anchorKey`, annars okänt. Nästa datum är senast gjord plus intervallet, lagt i första säsongsfönstret efter det. Utan senast gjord: nästa fönster räknat från i dag.
6. `WheelSetting` per kontroll går före: `paused`, `interval_months` (till exempel kommunens sotningsfrist som användaren bekräftar vid första loggen) och `month`. `planned_on` gäller bara nästa gång: kontrollen ligger på den dagen tills den loggas.

### Logg och återkoppling

`CheckLog` har hus, komponent (null för husgemensam), `templateKey`, `templateVersion`, `performedOn`, `result` (`OK`, `REMARK`, `NOT_DONE`), `note`, `measurements` (JSON), `source` och `changesetId`. Foton och filer kopplas via `CheckLogDocument` (logg, dokument) och laddas upp som andra dokument.

- **OK** flyttar fram nästa datum. Inget annat ändras.
- **Anmärkning** ger i samma ändringsset en åtgärd (`WorkItem` med `kind` `REPAIR` eller `INVESTIGATION` och `checkLogId`, så att den går att spåra till kontrollen) och en ny observation `condition` ett steg under den nuvarande, eller mallens `remarkCondition`, med säkerhet 0,8 (bedömt med ögat). Webben föreslår båda och användaren bockar av; från MCP är hela loggen ett utkast som visas som andra utkast.
- **Mätvärden** med `observationKey` blir observationer på delen eller huset: en radonmätning skriver `radon_bq_m3` och `radon_measurement_year`, en fuktkvot över gränsen ger en anmärkning.
- **Ej utförd** flyttar inget; kontrollen ligger kvar som försenad.
- Loggning kräver `status: PURCHASED`. En kandidat får förhandsvisningen, inget sparas.
- Varje kontrollsida säger att egenkontroll inte ersätter en överlåtelsebesiktning, eftersom loggen annars kan tas för en besiktning i en tvist. Mallar för el och våtrum hänvisar till behörig utförare.
- Svårighetsgraden styr inte prognosens pris i första versionen: profilerna har en kostnad utan uppdelning i arbete och material. Se "Öppna frågor".

Loggen har ett värde i sig: vid försäljning är den underlag för säljarens frågelista och köparens undersökningsplikt enligt jordabalken, och vid ett försäkringsärende visar den att underhållet är skött, vilket påverkar åldersavdrag och ersättning.

### Årshjul

Årshjulet är en vy, inte en egen lista. `planWheel(hus, år)` är ren och lägger ut allt som ska göras med huset under ett år, månad för månad, ur samma data som kontrollerna och prognosen:

| Källa | I hjulet som | Exempel |
| --- | --- | --- |
| Kontroller | Rutin, i sitt säsongsfönster | Byt FTX-filter i januari och september |
| Åtgärder från besiktningen | Åtgärd, i `WorkItem.seasonAnchor`-fönstret inom `yearMin`–`yearMax` | Stuprör bort från grunden vid snösmältningen |
| Förnyelser ur prognosen | Projekt, typiska förnyelseåret och typens `forecastDefaults.seasonAnchor` | Badrumsrenovering en sommar |
| Lagstyrda kontroller | Rutin med `rule: LAW`, när mallen gäller huset | Radonmätning vart tionde år, sotning när eldstad finns |
| Egna poster | Det användaren lägger till | Smörj den motordrivna garageporten |

Krav:

1. Tolv månader för valt år, med filter på källa, svårighetsgrad och del.
2. **Fördela lasten.** Högst sex poster per månad som standard. Har en månad fler flyttas de minst brådskande till den minst belastade månaden inom samma säsongsfönster. Regeln är deterministisk och testad.
3. **Användaren flyttar.** En flyttad post är en `WheelSetting` med `month` och, för engångsposter, `year`. Valet gäller per hus och kommande år och går före fördelningen.
4. Gjort, ska göras och försenat, ur loggen och nästa datum.
5. **Kalenderprenumeration (iCal).** `GET /api/calendar/<token>` är en route handler, ett undantag från "inga REST-endpoints för appdata" på samma grund som dokumentfilerna: läsaren är en kalenderklient. `CalendarToken` har hus, hash av token, `createdAt` och `revokedAt`; en återkallad länk ger 404 och en ny skapas på hjulets sida. Posterna innehåller titel, månad och en länk till kontrollsidan, ingen adress. Routen måste vara öppen för kalenderservrar: inte bakom Access och inte i WAF-regeln för Anthropics intervall.
6. En utskriftsversion på en A4-sida med utskrifts-CSS på hjulets flik.
7. **Påminnelser** är i första hand en schemalagd uppgift i användarens egen Claude, ungefär en gång om dagen. Den hämtar dagens och månadens poster med `get_year_wheel`, säger till när något är aktuellt och frågar om användaren vill planera in det. Ett ja blir en `WheelSetting` `planned_on` via `adjust_wheel_item`; vill användaren ha det i kalendern lägger Claude in det med sin egen kalenderkoppling. En inplanerad post tas upp igen samma dag, så att Claude kan fråga hur det gick och logga resultatet. Kalenderprenumerationen är alternativet för den som inte vill ha en schemalagd uppgift. Husvan skickar inget självt och skriver inte i någon kalender, ingen egen mejl- eller pushinfrastruktur. Hjälpsidan beskriver hur man sätter upp båda.

**Egna poster.** En egen återkommande post är en `CheckTemplate` med `houseId` och `changesetId` (skapad på webben, källa `USER`, godkänd direkt) och behandlas som biblioteksmallar vid genereringen. En engångspost är en `WorkItem` med källa `USER`, som i dag.

**Ekonomiskt lager (tillval, etapp 11).** Hjulet kan visa pengar: driftens fasta poster per månad och förnyelserna med sin kostnad, ur samma prognos. Lagret slås på per hus (`Assumption` `wheel_show_costs`). ROT-avdrag på hantverkarens arbete (`TaxParameter` `rot_deduction_rate` och `rot_cap_sek_per_person`) kräver en arbetsandel per profil, som saknas i dag. Villaförsäkringens åldersavdrag, som gör att ett byte i tid lönar sig, är en senare påbyggnad.

### Säsong per ort

Mallarna anger en säsong, inte en månad. Husvan översätter säsongen till månader via husets kommun: samma mall hamnar i april–maj i Luleå och i mars i Malmö.

| Säsongsankare | Betydelse | Luleå, uppskattning | Malmö, uppskattning |
| --- | --- | --- | --- |
| `AFTER_SNOWMELT` | Marken är bar och smältvattnet syns | april–maj | mars |
| `DRY_SEASON` | Målning och utvändigt träarbete | juni–augusti | maj–september |
| `AFTER_LEAF_FALL` | Hängrännor och takavvattning | september | oktober–november |
| `BEFORE_FROST` | Utekranar, kondensvatten, tätning | september–oktober | november |
| `BEFORE_HEATING_SEASON` | Värmesystemet ses över | augusti–september | september–oktober |
| `WINTER_SNOW` | Snölast, is och istappar | december–mars | vid behov |
| `FIXED_MONTH` | Samma månad överallt | brandvarnare i december | samma |
| `ANY` | Ingen säsong, fördelas jämnt | | |

Månaderna är grova uppskattningar och kalibreras mot SMHI:s öppna data för normalperioden 1991–2020 innan de seedas.

- **Zoner.** `Municipality.climateZone` är `NORRLAND_INLAND`, `NORRLAND_COAST`, `SVEALAND` eller `GOTALAND`, Husvans egna zoner och inte Boverkets energizoner. Fler zoner när data visar behov. Luleå är kust; Boden preliminärt inland, eftersom DVUT är 2,4 grader kallare, att verifiera mot SMHI. En kommun utan zon får Svealands fönster och posten flaggas.
- **Fönster.** `SeasonWindow` har zon, säsongsankare, `monthFrom` och `monthTo`, seedade från `prisma/data/seasonWindows.mts` med källa.
- **Per hus.** `Assumption` `climate_zone` byter zon för ett hus i en kall dalgång. Finare justering görs per post med `WheelSetting` `month`.
- **Snö.** Kommunens `groundSnowLoadKnM2` finns redan; den ger riskintervallet för takets snökontroll.

### Svenska regler och rekommendationer

Mallarna bygger på svenska myndigheters krav och råd och skiljer på lagkrav, försäkringsvillkor och rekommendation (`rule`). Raderna verifieras mot källan innan de blir mallar.

| Kontroll | Vem bestämmer | Intervall | Gäller när |
| --- | --- | --- | --- |
| Sotning (rengöring) | Kommunen sätter frister | Per kommun, ofta 1–4 år. Mallen har ett standardintervall per eldstadstyp; användaren bekräftar kommunens frist vid första loggen (`WheelSetting` `interval_months`) | `chimney`, `wood_stove` eller `pellet_boiler` finns. Okänd eldstad ger en öppen fråga |
| Brandskyddskontroll | MSB:s föreskrifter, utförs av kommunen | 3 eller 6 år | Som ovan |
| OVK | Boverket | Småhus med FT eller FTX: bara en första besiktning, ingen återkommande | `ventilation_ftx` |
| Radonmätning | Strålsäkerhetsmyndigheten, råd | Vart tionde år och efter ombyggnad, riktvärde 200 Bq/m³ | Alla hus; `anchorKey` `radon_measurement_year` |
| Energideklaration | Boverket, lagkrav vid försäljning | Giltig 10 år | Alla hus; `anchorKey` `energy_declaration_year` |
| Elinstallation | Elsäkerhetsverket | Inget lagkrav på återkommande kontroll, råd om egen kontroll; test av jordfelsbrytaren | `electrical_panel`, `electrical_installation` |
| Våtrum | Försäkringsvillkor, branschregler (GVK, BKR, Säker Vatten) | Egen kontroll varje år, arbete av behörig | `bathroom` |
| Snö och is från tak | Ordningslagen, fastighetsägarens ansvar | Vinter | `roof_covering` |
| Enskilt avlopp och egen brunn | Kommunens miljökontor, Livsmedelsverkets råd | Slamtömning per kommun, vattenprov vart tredje år | Nya komponenttyper `private_sewage` och `water_well`, utan profil |
| Brandvarnare | MSB:s och Boverkets allmänna råd | Test regelbundet, byt batteri årligen | Alla hus, fast månad december |

Sotningsfristerna saknar nationell källa, och sotaren kallar ändå; Husvan loggar snarare än påminner. Kommunala regler ändras, så en årlig post ber användaren kontrollera fristen.

### Gör-själv-nivå i stället för användarnivåer

Ingen indelning i nybörjare, normal och expert: folk bedömer sin egen nivå fel, och tre nivåer ger tre texter att underhålla. I stället säger `Assumption` `diy_level` (per hus eller standard för alla) vad hushållet gör självt:

| `diy_level` | Egen uppgift | Köpt tjänst |
| --- | --- | --- |
| `none` | Inga, bara titta och logga | Alla kontroller och åtgärder |
| `simple` (standard) | `EASY` | `MEDIUM` och `HARD` |
| `most` | `EASY` och `MEDIUM` | `HARD`, och allt som kräver behörighet |

Nivån styr vilka poster som visas som egna i hjulet och hur mycket av kontrollsidan som är utfälld från början. Raden om varför kontrollen finns visas alltid; steg för steg och verktyg är infällda för `most`. El och våtrum visas aldrig som egna uppgifter. När profilerna får en arbetsandel styr nivån också prognosens timpris.

I jämförelsen av kandidathus läggs en rad till: antal kontroller och åtgärder första året, varav hur många som kräver fackman.

### MCP-verktyg för underhållsläget

| Verktyg | Vad det gör | Läser/skriver |
| --- | --- | --- |
| `list_checks` | Husets kontroller med nästa datum, säsongsfönster, varför den finns (riskraden), senaste logg och vad som är försenat | Läser |
| `get_year_wheel` | Årshjulet för ett hus och ett år, månad för månad, med källa, svårighetsgrad och utförare per post. Underlaget för påminnelser i användarens Claude | Läser |
| `log_check` | Loggar ett resultat med mätvärden och dokument, till exempel från ett foto användaren skickar. Vid anmärkning följer åtgärden och skicket med i samma utkast | Skriver utkast |
| `adjust_wheel_item` | Flyttar en post till en annan månad eller ett annat år, planerar in den en viss dag (`planned_on`), pausar den eller sätter eget intervall | Skriver |
| `type_library` | Visar även kontrollmallarna per typ | Läser |
| `open_questions`, `answer_questions` | Frågor om okända delar som styr kontroller (`decides: "check"`) | Som i dag |
| `add_work_item`, `propose_changes` | Åtgärder får `seasonAnchor` | Som i dag |
| `compare` | Första årets kontroller och åtgärder för kandidater, varav fackman | Läser |

`propose_check_templates` byggs inte i första versionen; mallarna kommer in via seeden.

### Webben i underhållsläget

| Vy | Innehåll | Viktigaste interaktion |
| --- | --- | --- |
| Fliken **Årshjul** (`wheel`) på husets sida | Tolv månader i ett rutnät, färgat efter källa (rutin, besiktning, projekt, eget), med lista per månad som alternativ och filter på svårighetsgrad och del. Kalenderlänk och utskrift. För en kandidat första årets förhandsvisning | Dra en post till en annan månad, markera som gjord med ett tryck |
| Kontrollsidan `/houses/[id]/checks/[ref]` | Först raden om varför just detta hus ("Plattan har isoleringen ovanpå, därför var sjätte månad"), sedan vad man letar efter, så här gör man, verktyg och historik | Logga resultat, mätvärden och foto |

Loggningen görs på plats vid huset, så kontrollsidan byggs för mobilen först. Raden om varför kontrollen finns skiljer Husvan från en generisk checklista.

## Byggordning

Varje milstolpe ska gå att visa i Claude eller i webbläsaren innan nästa påbörjas.

0. **Verifiera kopplingen.** Next.js-app med Better Auth (`mcp`, `cimd`, `jwt`), en seedad användare och en MCP-route med ett verktyg, körd över HTTPS. Läggs till som egen koppling i claude.ai med "Use Claude's published identity". Avgör protokollversion och om `legacy: "reject"` går att använda, och vilka sökvägar Better Auth använder, så att WAF- och Access-reglerna kan skrivas.
   - **HTTPS före k3s.** Anthropics servrar måste nå appen redan nu, men driften kommer i milstolpe 7. Den lokala appen exponeras därför med en Cloudflare Tunnel (`cloudflared`) på `dev.husvan.se`, med samma WAF-regel och Access som produktionen. `BETTER_AUTH_URL` och MCP-resursen pekar på dev-värden, och kopplingen i Claude heter `https://dev.husvan.se/api/mcp`. Eftersom `resource` måste vara exakt den adress som skrivs in läggs kopplingen till på nytt med `https://husvan.se/api/mcp` i milstolpe 7.
1. **Grund.** Prisma-schema och första migration, Compose med Postgres för lokal körning, Dockerfile och bygg-workflow, Vitest.
2. **Data.** Kommuner (Luleå 2580, Boden 2582), typbibliotek, livslängdsprofiler med källor, BKI-serie, områdesstatistik från Brå och SCB för Luleå och Boden, skatteparametrar och tomträttspolicyer för båda kommunerna. Kommunalskatten importeras för alla 290 kommuner från SCB:s årstabell, eftersom det kostar lika lite som att importera två; varje kommun får då en rad i `Municipality` med kod och namn. Det mest arbetskrävande steget, och det ligger inte i kod.
3. **Läsverktyg** mot seedad data: `list_houses`, `get_house`, `type_library`.
4. **Skrivverktyg** med utkast och godkännande.
5. **Prognos och jämförelse.**
6. **Webbsida**, först visning, sedan rättning och filuppladdning. Sist den publika startsidan.
7. **Drift i k3s.** Manifest och Kargo-pipeline i infra-gitops, databas och roll på den delade Postgres, första migration via port-forward, första manuella promotion. Därefter WAF-regeln för Anthropics IP-intervall och Access framför webben. Verifiera att Claude fortfarande kan ansluta och logga in när reglerna är på. När appen är klar tas Access bort och startsidan blir publik. WAF-regeln för MCP ligger kvar.
   - **Läge 2026-11-02.** Appen kör på `https://husvan.se` från infra-gitops (PR 2 där), databasen är migrerad och seedad, och `0.1.0` är promoverad till `production` i Kargo (Kargos commit på `main` pinnade samma digest). Direkt mot origin svarar `/api/mcp` med `401` och rätt `WWW-Authenticate`, och metadatan har CIMD, `none` och `S256`. Kopplingen `https://husvan.se/api/mcp` lades till i claude.ai samma kväll (inloggning med e-postlänk) och `list_houses` svarade från produktion, så milstolpe 7 är klar. Release `0.2.0` (e-postinloggning) gick igenom hela kedjan utan handpåläggning: bygge, Warehouse, autopromotion, migrations-Job och ny pod. Se "Avgjort i milstolpe 7" under "Leverans och drift".

Underhållsläget (se "Underhållsläge: kontroller och årshjul") kommer därefter. Årshjulet, loggen och ekonomin bygger alla på kontrollschemat, så det kommer först. Varje etapp är klar när kriteriet är uppfyllt.

8. **Kontroller.** Migration för `CheckTemplate`, `SeasonWindow`, `Municipality.climateZone`, `CheckLog`, `CheckLogDocument`, `WheelSetting`, `CalendarToken`, `WorkItem.seasonAnchor` och `WorkItem.checkLogId`; komponenttyperna `private_sewage` och `water_well`. Mallar med källa per mall, klimatzoner och säsongsfönster som data, seedade. `planChecks` med tester, `list_checks`, frågorna med `decides: "check"`, fliken Årshjul i listform och kontrollsidan. **Klart när** Yxgränd 6 får ett kontrollschema utan kontroller för delar huset saknar, med tätare fuktkontroll av syllen och besiktningens anmärkningar inlagda.
9. **Logg.** `log_check` från MCP och loggning på webben i mobilen, med foto, mätvärden, anmärkning som ger åtgärd och skick, och texten om att egenkontroll inte ersätter besiktning. **Klart när** en loggad anmärkning syns som åtgärd och som sänkt skick i prognosen.
10. **Årshjul.** `planWheel` med lastfördelning och tester, rutnätet med flytt, `get_year_wheel`, `adjust_wheel_item`, kalenderprenumerationen med återkallbar token, utskriften och hjälpsidan om påminnelser via kalender och schemalagd uppgift i Claude. Raden i jämförelsen. **Klart när** hjulet för ett år syns i en kalenderapp och en daglig schemalagd uppgift i Claude tar upp en aktuell post, planerar in den på användarens ja och frågar om resultatet den dagen.
11. **Ekonomiskt lager.** Pengar i hjulet, ROT med arbetsandel per profil och `diy_level` i prognosens timpris. **Klart när** hjulet visar månadens kostnad och ett hantverkarbyte visas med och utan ROT.

## Utanför version 1

ChatGPT-app, fakturainkorg, egen påminnelseinfrastruktur (mejl, push), energikalkyl för fönsterbyten, delning, typskyltsigenkänning, händelser (service, reparation) utöver kontrolloggen och relationer mellan komponenter.

## Öppna frågor

- Kostar Boverkets API för energideklarationer något? (Kräver avtal som företag.)
- Fjärrvärme i Boden har inget pris per kWh: Bodens Energi publicerar bara tariffens delar. Ett hus där med fjärrvärme och bara energianvändning får ingen uppvärmningskostnad förrän användaren sätter `district_heating_price_sek_kwh`.
- Snöröjning och takskottning efter snözon saknar kostnadsdata och ingår inte i prognosen.
- Hur får huset sina koordinater, så att `deso_code` och snölasten kan räknas fram? Boverkets klimatlast-API ger `s_k` för en punkt (Luleå centrum 2,5 kN/m², resten av kommunen 3,0).
- Följer pantbreven i en tomträtt med till fastigheten vid friköp, eller måste nya tas ut? Avgör om friköpet kostar stämpelskatt för pantbrev.
- Tomträttspolicyer för hela Sverige saknar en nationell källa. Hur samlas och hålls 290 kommuners policyer aktuella i fullversionen?

Att verifiera innan milstolpe 8 börjar:

- Månadsfönstren per klimatzon mot SMHI:s normalperiod 1991–2020, och vilken zon Boden hör till.
- Standardintervall för sotning per eldstadstyp och fristerna för brandskyddskontroll mot MSB:s föreskrifter; sotningsfristerna sätts av kommunen och saknar nationell källa.
- Hur ett nej på en egenskapsfråga slås ihop med husets nuvarande `absent_features`, som är en lista i en enda observation.
- Om svårighetsgraden ska styra prognosens pris kräver profilerna en arbetsandel (arbete mot material), som också ROT-avdraget behöver. Vilka källor ger den?
- Kalenderrouten måste nås av Googles och Apples kalenderservrar, alltså ligga utanför både Access och WAF-regeln för Anthropics intervall. Hur avgränsas den i infra-gitops?

Besvarat i milstolpe 5:

- **Standardpriser för energi** ligger kvar i `prisma/data/municipalities.mts` med källor och används när användaren inte satt eget pris. `Assumption` behöver ingen nivå per kommun.
- **Ommålning** är en återkommande kostnad i profilen, se "Regler för beräkningen".

Besvarat i milstolpe 2:

- **Fgeo, DVUT och snözon** finns med källa i `prisma/data/municipalities.mts`. BBR upphävdes 2026-10-01 av BFS 2026:9, som behåller Fgeo per kommun (Luleå 1,5, Boden 1,6; Boden var 1,5 i BBR 29). Snölasten kommer ur BFS 2024:6, som ersatte EKS. DVUT gäller tidskonstanten ett dygn, vilket är en bedömning för ett lätt trähus.
- **SMHI:s Snötyngd** visar bara aktuell snölast och går inte att hämta som data. Boverkets klimatlast-API är källan i stället.
- **Pristyper.** Handelsbanken ger en klumpsumma och en livslängd per byggnadsdel för en genomsnittsvilla, med mycket eget arbete; den går bara att använda som `HOUSE`, eller `EACH` för kök och badrum. Planima skriver enheten i åtgärdens namn ("per st", m², m) och översätts till `EACH`, `M2` och `LINEAR_M`, men hela listan kräver konto. Villaägarnas öppna sidor ger nästan bara livslängder. Kostnaderna vilar därför mest på pris- och hantverkarsidor från 2025–2026.
- **Brå och SCB.** Se "Området".
- **Nils Holgersson** har ingen småhusvariant; tarifförändringarna gäller ett flerbostadshus med 15 lägenheter, och el avser bara nätavgiften.
