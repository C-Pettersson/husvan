# Husvan

Husvan (husvan.se) är ett verktyg för att förstå vad ett hus kostar över tid.

- **Version 1: köpunderlag.** Ägaren lägger in hus han är intresserad av, ser kostnaden framåt och jämför husen.
- **Senare: underhåll.** När ett hus är köpt blir samma hus utgångspunkt för underhållsplan, påminnelser och kvitton. Inga data flyttas, huset får bara status `PURCHASED`.

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

Det är ett personligt verktyg för en användare i version 1. Allt arbete sker i användarens egen Claude:

1. Användaren lägger till Husvans MCP-server som egen koppling (custom connector) i Claude och loggar in med OAuth.
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
| Autentisering | **Better Auth** med pluginen `mcp` (OAuth 2.1-auktoriseringsserver i samma app), `cimd` och `jwt`. Ersätter NextAuth, som inte kan agera auktoriseringsserver. Inloggning med e-post och lösenord, registrering avstängd, en användare seedas. `mcp` och `cimd` är egna paket (`@better-auth/mcp`, `@better-auth/cimd`) byggda på `@better-auth/oauth-provider`; `jwt` kommer från `better-auth/plugins`. Konfigurationen ligger i `src/lib/auth.ts`. |
| Test | Vitest. |
| Drift | k3s på användarens VPS, styrt från `C:\projects\infra-gitops` med Argo CD, Kustomize, KSOPS och Kargo. `husvan.se` för webben, MCP på `https://husvan.se/api/mcp`. En värd, så att `/.well-known/*` och MCP-sökvägen delar ursprung. Se "Leverans och drift". |
| Lokal körning | `docker compose up -d postgres`, `yarn db:migrate`, `yarn db:seed`, `yarn import:bki`, `yarn import:scb`, `yarn import:bra` och `yarn dev`, som i brfjamforelse. Postgres 16 lyssnar på `localhost:5433` (5432 används av andra projekt); kopiera `.env.example` till `.env` och fyll i hemligheten och den seedade användaren. Compose får senare en valfri app-image för att testa containern; det är inte produktionsmiljön. |

Skillnader mot brfjamforelse: ingen organisationsmodell, inga kvoter, ingen egen AI-anropning, ingen publik yta utöver startsidan. Det som inte behövs byggs inte.

### Leverans och drift

Manifesten följer standarden i infra-gitops (`apps/<app>/base` och `apps/<app>/envs/production`, upptäckta av ApplicationSet:et i `appsets/production.yaml`). Förebilden är `apps/brfjamforelse-se`.

- **Image.** GitHub Actions bygger och pushar `ghcr.io/c-pettersson/husvan` när en semver-tagg pushas, samma workflow som brfjamforelse. Dockerfile enligt brfjamforelse: Node 22 Alpine, flerstegsbygge, `prisma generate` vid bygget, `yarn start` på port 3000.
- **Manifest.** `apps/husvan-se/base` med Deployment (en replika, `envFrom` från Secret `husvan`, `imagePullSecrets: regcred`) och Service på 3000. `apps/husvan-se/envs/production` med Traefik-Ingress för `husvan.se`, `secrets.sops.yaml`, `registry-creds.sops.yaml` och `cloudflare-origin-certificate.sops.yaml`, alla krypterade med SOPS och age enligt `.sops.yaml`. Namnrymden blir `husvan-se-production`.
- **Release.** `kargo/pipelines/husvan-se` med Project, ProjectConfig (`autoPromotionEnabled: false`), Warehouse mot GHCR med semver-filter och en manuell `production`-stage som använder `kargo/base` PromotionTask. Promotion pinnar image-digest i `envs/production/kustomization.yaml`, committar till `main` och låter Argo CD synka. Lägg till appen i `scripts/lib/workloads.mjs` och kör `npm run validate` och `npm test` i infra-gitops.
- **Databas.** Den delade Bitnami-Postgres i namnrymden `default` (`postgres-postgresql.default.svc.cluster.local:5432`), med en egen databas `husvan` och en egen roll. Migrationer körs med `yarn prisma migrate deploy` mot databasen via port-forward, som i brfjamforelse. Ingen migration körs automatiskt vid podstart.
- **Dokumentfiler.** Cloudflare R2 via S3-API:t, med samma `STORAGE_*`-inställningar som brfjamforelse (se `.env.example`). Nycklarna ligger i Secret `husvan`. Ingen PVC för filer.
- **Framför klustret.** Cloudflare som DNS-proxy med origin-certifikat i Ingress-TLS:en; Traefik litar redan på Cloudflares IP-intervall för vidarebefordrade headers. En WAF-regel släpper bara in Anthropics IP-intervall `160.79.104.0/21` till MCP-routen, token- och JWKS-endpoints och `/.well-known/*`. Under utvecklingen står Cloudflare Access (bara ägarens e-post) framför alla andra sökvägar, alltså webbsidorna och OAuth-inloggningen. Access är tillfälligt: när appen är klar tas det bort, startsidan `/` blir publik och resten av webben skyddas av Better Auths inloggning. Exakta sökvägar fastställs i milstolpe 0 när Better Auths routes är kända. Samma regler gäller `dev.husvan.se`, tunneln till den lokala appen fram till milstolpe 7. En Tailscale-Ingress som i brfjamforelse är valfri för privat åtkomst förbi Cloudflare.
- **Regel.** Inga direkta ändringar i klustret. Allt går via manifest i infra-gitops, commit, push och reconciliation i Argo CD. Samma regel som i det repots `AGENTS.md`.

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
| Allt annat utom `/` | Användarens webbläsare | Access, senare Better Auths inloggning |

Claude Code ansluter från användarens egen dator, inte från Anthropics intervall, och stängs därför ute av WAF-regeln.

Servern hämtar själv JWKS för att verifiera token på MCP-routen. Den hämtningen går till appens interna adress (`getInternalUrl()` i `src/lib/siteUrl.ts`), inte till den publika, eftersom WAF-regeln annars blockerar servern från sin egen `/api/auth/jwks`.

## Datamodell

Principerna, i den ordning de styr schemat:

1. **Fast kärna, dynamiska fakta.** `House` har ägare, adress, kommun, fastighetsbeteckning och status. `Component` har hus, typ, förälder, vad den ersätter och ett namn. Allt annat som Claude läser ut är en `Observation`: nyckel, värde, källa, dokument, säkerhet.
2. **Observationer, inte giltighetstider.** Att prospektet säger 1995 och besiktningen 2001 är inte en förändring över tid utan två påståenden. Därför finns ingen `valid_from`/`valid_to` på värden. Varje observation är en rad med `recordedAt`; det aktuella värdet väljs vid läsning. När något faktiskt byts ut är det komponentens livscykel som ändras, inte värdet.
3. **Bara tillägg.** Ingen rad raderas, och inget påstående skrivs över. Ett bättre värde är en ny observation; ett felaktigt får `retractedAt`, och så gör en åtgärd som avfärdas. De enda fält som ändras på plats är `retractedAt`, ändringssetets status, husets kärnfält (adress, kommun, fastighetsbeteckning, status) och ett dokuments `storagePath` när originalfilen laddas upp, med filens `sha256`, namn och typ där de saknas. En utbytt del är en ny `Component` med `replacesId` mot den gamla, och en åtgärd som preciseras, till exempel med en kostnad, är en ny `WorkItem` med `replacesId` mot den gamla. Att en rad är ersatt härleds, det lagras inte på den gamla raden.
4. **Utkast är riktiga rader.** Allt som skrivs via MCP eller webben pekar på ett `Changeset`. Rader i ett `DRAFT`-ändringsset finns i tabellerna men filtreras bort vid läsning tills användaren godkänner. Godkännande ändrar en status; inget transformeras från JSON till rader. Samma kod renderar utkast och godkända data.
5. **Källa är vem, inte vad.** `ValueSource` är `USER`, `CLAUDE` eller `IMPORT`. Vilken sorts dokument värdet kommer från är `Document.type`. Besiktningen är ett dokument, inte en källa.
6. **Typbibliotek som växer.** `ComponentType.attributeSchema` säger vad Claude ska leta efter men begränsar inte vad som får sparas. Om en nyckel ligger utanför schemat räknas fram vid läsning, det lagras inte.
7. **Inga cacher.** Aktuella värden räknas fram vid läsning. Datamängden är en användares hus.
8. **Spara originalet.** Fil, fulltext och Claudes tolkning sparas oförändrade.

### Aktuellt värde

För varje (komponent, nyckel) bland observationer som inte är återkallade och vars ändringsset är `APPROVED`: `USER` före `CLAUDE` före `IMPORT`, därefter högst `confidence`, därefter senast `recordedAt`. Övriga observationer visas som alternativ med sin källa. Regeln ligger på ett ställe i koden och används av både MCP och webben.

### Huset ett visst datum

Komponenter vars ändringsset godkändes före datumet och som inte ersatts av en komponent godkänd före datumet, med observationer registrerade före datumet. Räcker för "hur såg bedömningen ut före besiktningen". Exakt bitemporalitet är inte ett mål.

### Varför schemat ser ut som det gör

| Val | Alternativ som valdes bort | Skäl |
| --- | --- | --- |
| Observationer med `retractedAt` | `valid_from`/`valid_to` per värde | Blandade ihop när något gällde med när vi fick veta det. Krävde ett partiellt unikt index som Prisma inte kan uttrycka och som förbjöd två aktuella Claude-värden från olika dokument. |
| Utkast som rader i `DRAFT`-ändringsset | Utkastet som JSON i `changeset.proposal` | JSON-varianten krävde en andra datamodell för utkast, egen validering, egen rendering och en transformering vid godkännande. |
| `replacesId` på den nya komponenten | `replaced_on`/`replaced_by` på den gamla | Ett utkast kan då uttrycka ett byte med bara en insert. Den gamla raden rörs aldrig. |
| `LifespanProfile` med kurerade värden och `sources` som JSON | En rad per typ och källa som vägs ihop vid körning | Sammanvägningen är redaktionellt arbete som görs en gång, inte en beräkning per prognos. Råvärdena finns kvar för spårbarhet. |
| `MunicipalTariffChange` och `PriceIndex` som egna tabeller | `tariff_changes` som JSON på kommunen | Typade värden med unika nycklar. En nullbar kommunkolumn i ett unikt index släpper igenom dubbletter i Postgres. |
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
| `propose_changes`, `add_work_item` | `DRAFT` tills `confirm_changes`. | Påståenden om huset som Claude läst ut. |
| `answer_questions` | `DRAFT` tills `confirm_changes`. | Svaren går genom Claude, som kan ha missförstått dem. |
| Svar på en öppen fråga på webben | `APPROVED` direkt med källa `USER`. | Användaren svarar själv. |
| Rättning på webbsidan | `APPROVED` direkt med källa `USER`. | Användaren gör ändringen själv. Se "Webben". |

`confirm_changes` tar `approve` eller `reject`. Avslagna rader finns kvar men syns aldrig. Utkast valideras mot typbiblioteket redan vid `propose_changes`, så att Claude får felet medan den har dokumentet framför sig.

Ordningen i chatten: `create_house`, sedan `save_document` för varje dokument, `type_library` och sist `propose_changes` där varje värde pekar på sitt `documentId`. Ett dokument kräver ett hus, så värden som skickas med `create_house` kan inte peka på något dokument; de är till för det användaren skriver i chatten. Valideringen (`validateChanges` i `src/server/houses/changes.ts`, värdena i `src/server/library/checkValue.ts`):

- **Allt eller inget.** Vid minsta fel skrivs ingenting, och svaret listar alla fel med sökväg, till exempel `components[3] roof_covering.values[0] material: must be one of …`.
- **Typer och värden.** Komponenttypen måste finnas. En nyckel i typens `attributeSchema` eller i husets nycklar (`houseKeys.ts`) kontrolleras mot sin datatyp, sina val, `min`/`max` och sin enhet; utelämnad enhet blir nyckelns. En nyckel utanför schemat sparas med en varning. `absent_features` får bara nämna typer som finns, eller `basement`.
- **Trädet.** `parent` är en `ref` som deklarerats tidigare i samma anrop eller id:t på en befintlig komponent, och förälderns typ måste ha barnets typ i `allowedSubcomponents`. `replaces` måste vara en befintlig komponent som inte redan är ersatt, och en ersatt komponent tar inte emot nya värden.
- **Precisera en åtgärd.** `replaces` på en åtgärd pekar på en befintlig åtgärd som inte redan är ersatt; den nya tar komponenten från den gamla om den inte anger någon. Så prissätter Claude ett besiktningsfel utan kostnad utan att det räknas två gånger. Den gamla döljs vid läsning när den nya syns, och avslås utkastet syns den gamla igen.
- **Ett byte i taget.** En komponent eller åtgärd som ett annat öppet utkast redan ersätter kan inte ersättas i ett nytt; Claude lägger till i det utkastet med `draftId` eller låter användaren avgöra det först. Annars skulle två godkända utkast ge två aktuella rader.
- **Vad ett utkast får peka på.** Godkända komponenter och dokument i samma hus, och komponenterna i det utkast som `draftId` lägger till i. Ett tillägg låser utkastets rad, så att ett godkännande inte kan smita in emellan och göra nya rader synliga ogranskade.
- **Upprepning.** `create_house` vägrar ett hus med samma gatuadress (delen före första kommatecknet, utan hänsyn till skiftläge) eller samma fastighetsbeteckning och returnerar det befintliga id:t. `save_document` med samma `sourceUrl` eller `sha256` returnerar det första dokumentet.
- **Språk.** Komponenternas `name` och åtgärdernas `description` skrivs på svenska, eftersom användaren läser dem; `quote` är dokumentets egna ord.

Värden från MCP får alltid källa `CLAUDE`. Att återkalla en observation eller avfärda en åtgärd (`retractedAt`) går inte via MCP i version 1; en bättre läsning är en ny observation, en bättre åtgärd ersätter den gamla med `replaces`, och rättningar görs på webbsidan.

### Konventioner

- Attributnycklar och typnamn i datan är engelska, ASCII i snake_case (`installation_year`, `underfloor_heating`).
- Datum i ISO 8601. Belopp i kronor (`Decimal`, suffix `Sek`). Enheter anges explicit (`m2`, `kWh`, `W/m2K`).
- Datatyper för attribut: `text`, `number` (med enhet och valfritt `min`/`max`), `year`, `date`, `boolean` (ja/nej, till exempel `rcd`), `choice` (lista), referens till `actor`, `document` eller `component`. Formen valideras med Zod i `src/server/library/schema.ts`.
- Nycklar som prognosen läser och som därför måste heta lika i alla typer: `installation_year`, `condition` (1–5, 5 är nytt), `area` (m2), `length` (m), `quantity` (antal). På huset: `construction_year`, `living_area`, `heating_kwh_per_year`, `electricity_kwh_per_year`, `operating_cost_sek_per_year`.
- Köpdata är observationer på huset, med källa som alla andra värden: `asking_price_sek` (utgångspris), `highest_bid_sek` och `highest_bid_date`, `final_price_sek` (slutpris), `sale_status` (`upcoming`, `bidding`, `closed`), `assessed_value_sek` (taxeringsvärde) och `assessment_year`. `sale_status` gäller försäljningen och är skilt från husets `status`.
- **Pris** i prognos och jämförelse är `final_price_sek` om det finns, annars `highest_bid_sek`, annars `asking_price_sek`. Svaret säger alltid vilket av dem som användes.
- Egenskaper som är observationer på huset: `room_count` (antal rum), `floor_count` (våningar), `energy_class` (`A`–`G`), `energy_performance_kwh_per_m2` (primärenergital) och `energy_declaration_year`, `absent_features` (lista med typnamn som huset uttryckligen saknar), `deso_code` (SCB:s demografiska statistikområde) och `police_area_code` (lokalpolisområde).
- **Radon** är observationer på huset: `radon_bq_m3` (årsmedelvärde i inomhusluften, Bq/m³), `radon_measurement_year` och `radon_measured` (`false` bara när ett dokument säger att radon inte är mätt; inte nämnt är okänt). En uppmätt halt över referensnivån 200 Bq/m³ (Strålsäkerhetsmyndigheten) flaggas vid läsning som riskkonstruktionerna, utan kronvärde.
- Husets `status` är `CANDIDATE`, `DECLINED` (avstått), `PURCHASED` eller `SOLD` och är ägarens beslut. Försäljningens läge är observationen `sale_status`, eftersom den kommer från annonsen och mäklaren och kan vara fel.
- Enumvärden är `UPPER_CASE` i databasen och får en översättningsnyckel per värde i webben (`house.status.purchased`).

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

Typerna finns i `prisma/data/componentTypes.mts` och profilerna i `prisma/data/lifespanProfiles.mts`; `yarn db:seed` lägger in dem. Seeden lägger till och skriver över de nycklar den själv definierar men behåller attribut och profiler som skapats under drift. En profil identifieras av typ och `match`. Av profilerna vars `match` stämmer med komponentens attribut används den som matchar den tidigaste nyckeln i typens `forecastDefaults.profileKeyOrder`, därefter den som matchar flest nycklar; tom `match` är typens standard. Ett relinat gjutjärnsrör följer alltså relining-profilen, eftersom `sewer_pipes` har ordningen `renovation_method`, `material`, `section`. Regeln ligger i `selectProfile` (`src/server/library/profiles.ts`), och `validateLibrary` kräver en ordning för varje typ vars profiler matchar på olika nycklar.

Klimatskal: `foundation`, `roof_covering`, `facade`, `window`, `exterior_door`, `drainage`, `foundation_waterproofing`, `crawl_space_dehumidifier` (avfuktare i krypgrund). Installationer: `heat_pump_air_water`, `heat_pump_ground`, `heat_pump_air_air`, `district_heating_substation`, `electric_boiler`, `electric_radiators` (direktverkande el), `pellet_boiler`, `wood_stove`, `chimney`, `ventilation_ftx`, `ventilation_exhaust`, `water_heater`, `water_pipes`, `sewer_pipes`, `electrical_installation`, `electrical_panel`, `underfloor_heating`. Inomhus: `kitchen`, `bathroom`, `garage_door`. Egenskaper, utan profil i version 1: `pool`, `sauna`, `deck`, `sunroom`, `garage`.

Fönster registreras styck för styck när underlaget tillåter det, annars som en komponent `window` med `quantity`.

Delar som varje hus har får `forecastDefaults.assumeUndocumented`: `roof_covering`, `facade`, `window`, `exterior_door`, `drainage`, `water_pipes`, `sewer_pipes`, `electrical_installation`, `electrical_panel`, `kitchen` och `bathroom`. Nämner underlaget ingen sådan del räknar prognosen med en från byggåret, se "Delar som inte nämns" i "Regler för beräkningen". Uppvärmning och ventilation antas inte, eftersom typen inte går att gissa. Dränering antas inte på plintgrund eller torpargrund (`assumeUnless`).

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
| `sewer_pipes` | `material` (`cast_iron` gjutjärn, `plastic`, `concrete`, `clay` lera), `section` (`indoor`, `under_slab` under grundplattan, `ground` i mark till förbindelsepunkten), `renovation_method` (`replaced`, `relined`), `installation_year`, `condition`. En komponent per sträcka, eftersom de åldras olika. |

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
| Väderstreck | `orientation` (`north`, `north_east`, `east`, `south_east`, `south`, `south_west`, `west`, `north_west`) på `deck`, `sunroom`, `pool` och ett `window` som registreras för sig |
| Garage, dubbelgarage | `garage` med `capacity` (bilplatser) och `attached`; `garage_door` som delkomponent |
| Kamin | `wood_stove` |
| Luftvärmepump, AC | `heat_pump_air_air` |
| Uppvärmning | Härleds ur värmekomponenterna, lagras inte. Huvudsaklig uppvärmning är den som finns av `heat_pump_ground`, `heat_pump_air_water`, `district_heating_substation`, `electric_boiler`, `electric_radiators` och `pellet_boiler`; `wood_stove` och `heat_pump_air_air` räknas som komplement. |
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
| `list_houses` | Alla hus med status, försäljningsstatus, pris, underhållsjusterat pris och nyckeltal. Valfritt filter på egenskaper, där okänt redovisas skilt från nej | Läser |
| `get_house` | Allt om ett hus: komponentträd, aktuella värden med källa och alternativ, egenskaper, området, dokument, åtgärder, öppna utkast. Valfritt per datum | Läser |
| `get_document` | Ett sparat dokument: metadata, fulltexten i sidor och Claudes tolkning, så att en ny chatt kan läsa besiktningen igen utan ny uppladdning | Läser |
| `get_document_file` | Originalfilen som användaren laddat upp, oförändrad: foton som bild, PDF och text som inbäddad resurs. Servern läser inte filen; Claude tolkar den själv, till exempel ett foto av FTX-aggregatet eller en skadad fasad | Läser |
| `type_library` | Kända komponenttyper och deras attribut, så att Claude vet vad den ska leta efter | Läser |
| `create_house` | Nytt kandidathus. Kärnan sparas direkt, övriga uppgifter returneras som utkast | Skriver |
| `save_document` | Fulltext, metadata och Claudes tolkning. Originalfilen laddas upp via webben | Skriver |
| `propose_changes` | Nya komponenter och observationer, alla med källa. Returnerar ett utkast | Skriver utkast |
| `confirm_changes` | Godkänner eller avslår ett utkast | Skriver |
| `add_work_item` | Åtgärd från besiktningen eller eget val | Skriver utkast |
| `set_assumption` | Horisont, startår, ränta, energipriser, drifttrend | Skriver |
| `forecast` | Kostnad per år och post för ett hus | Läser |
| `open_questions` | Det analysen inte vet än om ett hus och hur mycket varje svar kan flytta underhållsskulden och prognosen, med snabbval och fritt värde per fråga: underlaget för en checklista inför visning | Läser |
| `answer_questions` | Användarens svar på öppna frågor, per fråge-id, som ett utkast | Skriver utkast |
| `compare` | Flera hus sida vid sida: pris, underhållsskuld och underhållsjusterat pris, prisskillnaden förklarad per komponent, därefter de största skillnaderna, egenskaper och området | Läser |

Verktygens beskrivningar och svar till Claude är på engelska. Claude svarar ändå användaren på svenska.

Läsverktygen ligger i `src/server/mcp/readTools.ts` och läser genom samma kod som webben: `getHouse` (med `asOf` för huset ett visst datum), regeln för aktuellt värde i `currentValue.ts` och det som härleds vid läsning i `derive.ts` (pris, egenskaper ja/nej/okänt, uppvärmning, antal badrum, riskkonstruktioner, äldre elsystem och radon över referensnivån). Nycklarna på huset finns för Claude i `src/server/library/houseKeys.ts` och returneras av `type_library` tillsammans med komponenttyperna. Verktyget `whoami` från milstolpe 0 är borttaget.

`forecast`, `open_questions` och `compare` ligger i `src/server/mcp/forecastTools.ts`; jämförelsen räknas i `compareHouses` (`src/server/forecast/compare.ts`), som webben också använder. `forecast` sparar varje prognos i `Forecast` och returnerar den förra som `previous`, så att Claude kan säga hur bedömningen ändrats. Engångsantaganden (`overrides`) sparas inte som antaganden och märks `this_forecast`. `compare` sorterar husen efter underhållsjusterat pris och förklarar skillnaden mot det första; ett hus utan kända driftkostnader har `runningCostsKnown: false` och `null` för driften i `largestForecastDifferences`. `list_houses` visar underhållsskuld och underhållsjusterat pris (typiskt värde).

Skrivverktygen ligger i `src/server/mcp/writeTools.ts` och skriver genom `createHouse`, `saveDocument`, `proposeChanges` (som även `add_work_item` använder), `answerQuestions` (för `answer_questions`), `confirmChangeset` och `setAssumptions` i `src/server/houses/`. Ett utkast returneras med `draftId` och `reviewUrl` (husets sida med `?draft=`), och `get_house` med `draftId` visar utkastets rader märkta `draft: true`, så att Claude kan berätta vad ett godkännande lägger till innan användaren bestämmer sig.

Ett anrop i protokollet 2026-07-28 kräver headrarna `Mcp-Protocol-Version`, `Mcp-Method` (och `Mcp-Name` för `tools/call`) och `params._meta` med `io.modelcontextprotocol/protocolVersion` och `io.modelcontextprotocol/clientCapabilities`. Det behövs för att anropa routen för hand.

Validera allt som skrivs. Fakturor och prospekt kan innehålla dolda instruktioner, så allt innehåll från dokument behandlas som data.

## Webben

Webben läser genom samma kod som MCP-verktygen (`getHouse`, `analyseHouse`, `compareHouses`) via tRPC-routern `house` i `src/server/trpc/routers/house.ts`. Den sparar inga prognoser; det gör verktyget `forecast`.

| Sida | Innehåll |
| --- | --- |
| `/` | Den publika startsidan: vad Husvan räknar och hur det används. |
| `/houses` | Husen med pris, underhållsskuld och underhållsjusterat pris med spann. Filter på egenskaper döljer bara hus där svaret är nej och visar hus med okänt svar för sig. 2–6 hus markeras för jämförelse. |
| `/houses/[id]` | Flikar som stannar överst när man skrollar, en i taget (`?tab=`): **Kostnad** (nyckeltal med spann, vad summan saknar eller gissar, kostnad per år som diagram och tabell, eller fördelad över livslängden, underhållsskuld per del, prognosens poster med flaggor, och antagandena), **Inför visningen** (`viewing`, checklistan), **Huset** (`house`: egenskaper och risker, värden, komponenter, åtgärder), **Dokument** och **Området**. Utan `?tab=` öppnas Kostnad, eller Huset när `?draft=` visar ett utkast på plats. |
| `/compare?ids=` | Husen sida vid sida som `compare`: nyckeltal, skillnaden mot det första per del, fel från besiktningen med okänt för obesiktigade hus, största skillnaderna i prognosen, egenskaper, risker och området. |

**Rättningar** (`src/server/houses/correct.ts`) är godkända direkt med källa `USER` och valideras som ett utkast, så att webben inte kan spara det MCP skulle vägra:

- **Värde.** En ny observation på huset eller en komponent, som går före Claudes. Det gamla värdet syns som alternativ.
- **Ta bort ett värde.** `retractedAt` på det aktuella värdet; finns ett annat värde för nyckeln används det.
- **Åtgärd.** En ny åtgärd, eller en ändrad som ersätter den gamla med `replaces`. Att avfärda en åtgärd sätter `retractedAt` på den och på de åtgärder den ersatte, så att ingen av dem räknas igen.
- **Huset.** Status, adress, fastighetsbeteckning och kommun ändras på plats, med samma kontroll mot dubbletter som `create_house` (`isSameHouse`).
- **Antaganden.** Som `set_assumption`, för huset eller alla hus.

Nya komponenter skapas inte på webben i version 1; det gör Claude med `propose_changes`. Undantaget är svaret på en öppen fråga om en del som underlaget inte nämner, som lägger till delen med svaret som enda värde.

**Originalfiler** laddas upp till `POST /api/houses/[id]/documents` (`uploadDocument` i `src/server/houses/uploadDocument.ts`) och visas via `GET /api/documents/[id]/file`. PDF, JPEG, PNG, WebP, HEIC och text, högst 25 MB. Filen kopplas till dokumentet med samma `sha256`, annars till dokumentet användaren valt (vägras om Claude angett en annan hash eller om dokumentet redan har en fil), annars blir den ett nytt dokument med källa `USER`. Samma fil igen gör ingenting. Objektnyckeln är `<STORAGE_PREFIX>houses/<husets id>/<sha256><filändelse>`. Servern läser inte filen; användaren ber Claude tolka den. Signeringen mot R2 (`src/server/storage/s3.ts`) är Signature V4 för hand, testad mot AWS:s exempel.

## Kostnadsprognos

Per hus och år över vald horisont, i startårets kronor:

1. **Byten enligt livslängd.** Bytesår = installationsår + livslängd, justerat efter skick. Kostnad = profilens pris × mängd, uppräknat från prisår till startår med byggkostnadsindex.
2. **Åtgärder från besiktning och prospekt.** Engångsposter, utlagda jämnt över `yearMin`–`yearMax`.
3. **Drift.** Uppvärmning, el, VA, sophämtning, försäkring, sotning. Från prospektet eller energideklarationen, trendat per kommun om användaren valt det.
4. **Regionalt.** Snöröjning och takskottning efter snözon. Saknas energidata: grov skattning av uppvärmning med Fgeo.
5. **Kapitalkostnad (valfri).** Ränta på lånet med användarens ränta.

Resultat: kostnad per år och post, summa, snitt per månad och ett spann (låg–hög) som blir bredare ju fler värden som saknas eller är osäkra. Jämförelsen börjar med underhållsjusterat pris (se nedan) och visar sedan de poster som skiljer mest. Prognoser sparas så att man ser hur bedömningen av ett hus ändras.

### Regler för beräkningen

- **Installationsår** är observationen `installation_year` på komponenten, annars husets `construction_year`. Saknas båda markeras posten som gissad och spannet breddas till hela livslängdsintervallet.
- **Mängd** följer profilens `costUnit`: `M2` läser `area`, `LINEAR_M` läser `length`, `EACH` läser `quantity` (standard 1), `HOUSE` är alltid 1. Saknas mängden räknas den ur husets geometri om typen har `quantityFromFootprint` och huset `floor_count`, annars ur typens `quantityPerLivingM2` gånger `living_area`, annars markeras posten som gissad. Se "Mängd ur boytan".
- **Skick** flyttar bytesåret. Standardregel, justerbar per typ i `forecastDefaults`: skick 5 använder `lifespanMaxYears`, 4 och 3 `lifespanTypicalYears`, 2 `lifespanMinYears`, 1 byte inom två år. Utan skick används `lifespanTypicalYears`.
- **Passerad livslängd** ger inte ett byte i det förflutna, och inte heller ett byte genast bara för att delen är gammal. Var bytet hamnar avgör besiktningen, se "Brådska ur besiktningen".
- **Ommålning.** En profil med `repaintMinYears`, `repaintTypicalYears`, `repaintMaxYears`, `repaintCostLowSek` och `repaintCostHighSek` (samma `costUnit` och `priceYear` som bytet) ger en ommålning med jämna mellanrum fram till nästa byte. Intervallet räknas från `last_painted_year`, annars `installation_year`, annars husets `construction_year`. Är `paint_type` känd används typens intervall i `forecastDefaults.repaintByPaintType`, annars profilens. Ett byte nollställer intervallet, eftersom en ny del levereras målad. Ommålning som passerat läggs på startåret och flaggas, som ett byte.
- **Delar som inte nämns.** Ett hus ska inte bli billigare för att underlaget säger mindre. Saknar huset en godkänd komponent av en typ med `assumeUndocumented` och nämner `absent_features` inte typen, räknar prognosen och underhållsskulden med en sådan del från byggåret, med mängd ur `quantityPerLivingM2`. Delen lagras inte, har id `assumed:<typ>`, märks `assumed: true` i prognosen och listas med sin underhållsskuld i `gaps.assumedParts`. Det är samma princip som "okänt är inte nej" för egenskaperna, men åt andra hållet: för kostnaden är okänt inte noll.
- **Delar som beror på resten av huset.** En typ kan läsa attribut från en annan komponent i huset med `forecastDefaults.context`, attribut mot typ, så att profilen kan matcha på dem; komponentens eget värde går före. Dränering läser `foundation_type` från grunden och prissätts efter den. `assumeUnless` säger när kontexten utesluter en antagen del. Posten flaggas `priced_by_context` med nyckel och värde.
- **Flera av samma.** En typ med `oneOfSeveral` (badrum) flaggar varje komponent med hur många huset har (`one_of_several`), eftersom en andra del i behov är mindre brådskande medan en annan fungerar. Summorna ändras inte; det är Claude som väger brådskan, och verktygsbeskrivningen säger det.
- **Billigare förnyelse.** En typ kan ha `forecastDefaults.cheaperRenewal`: när komponentens attribut finns i `when` eller är okända förnyas den i låg och typisk med profilen som `match` väljer, till den profilens kostnad och därefter med dess livslängd. Hög byter, eftersom inspektionen kan visa att det billigare inte går. För `sewer_pipes` är det relining av `cast_iron`, `concrete` och `clay`. Underhållsskulden räknas med samma kostnad per scenario. En del som redan är förnyad så, eller en bytesåtgärd med egen kostnad, förnyas inte billigare.
- **Inspektion före förnyelse.** En typ kan ha `forecastDefaults.inspection` med kostnad och källor, som filmning av avloppet. Inspektionen läggs en gång per hus och typ, året före den första förnyelsen i hög av en del utan `inspected_year`, men tidigast startåret, och kostar lika i alla scenarier. Den ingår inte i underhållsskulden. En besiktningsåtgärd om samma inspektion räknas inte bort.
- **Spann.** Låg använder `lifespanMaxYears` och `costLowSek`, hög använder `lifespanMinYears` och `costHighSek`. Varje post bär en lista över indata som saknas eller har `confidence` under 0,7.
- **Standardantaganden** när användaren inte satt egna: horisont 15 år, startår innevarande år, ingen kapitalkostnad, ingen drifttrend.

### Brådska ur besiktningen

Besiktningsprotokollet är det bästa underlaget för när något måste göras. En överlåtelsebesiktning är okulär, och köparen har en långtgående undersökningsplikt (jordabalken 4 kap. 19 §); det besiktningsmannen inte kunde se täcks i bästa fall av säljarens dolda fel-försäkring. Protokollen säger därför uttryckligen när något kräver mer: "fördjupad undersökning" eller "fortsatt teknisk utredning", en risk i riskanalysen eller ett fel som ska åtgärdas. En del som besiktningen såg utan sådan anmärkning fungerar, hur gammal den än är.

- **Allvar på åtgärder.** `WorkItem.severity` följer protokollets egna nivåer: `MINOR` mindre brist eller notering (Anticimex blå symbol: kräver ingen fördjupad undersökning), `RISK` risk i riskanalysen, `DEFECT` fel eller skada som bör åtgärdas, `SEVERE` allvarligt fel eller akut skada. En rekommenderad fördjupad undersökning är `kind: INVESTIGATION` med allvaret för det den gäller. Claude sätter allvaret ur protokollet och hittar inte på brådska som protokollet inte anger.
- **En del som passerat sin livslängd** placeras efter vad besiktningen sagt om den (`seenByInspection` i `forecast.ts`):

| Besiktningen | Bytet, år efter startåret (låg / typisk / hög) |
| --- | --- |
| Allvarligt fel (`SEVERE`) på delen | 0 / 0 / 0 |
| Huset besiktigat, delen dokumenterad och bara `MINOR` på den | 30 % / 20 % / 10 % av livslängden, minst 1 |
| Ingen besiktning, en antagen del, en undersökning, ett fel eller en risk på delen, eller en åtgärd utan allvar | 20 % / 10 % av livslängden / 0 |

  Underhållsskulden ändras inte: den räknar den förbrukade delen oavsett när bytet görs.

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

En fråga som inget svar flyttar tas bort, utom när svaret avgör en flaggad risk (`decides`): `foundation_type` och variantens attribut på grunden, `wiring` och `rcd`. Delar som underlaget inte nämner frågas också om, med id `assumed:<typ>` och `documented: false`: de antagna delarna, och typer som andra delar läser som kontext (grunden, som prissätter dräneringen). Svaret prövas som en antagen del med det enda värdet, så att inget annat ändras.

Det som inte går att pröva listas med `swing: null` efter de andra: `radon_bq_m3` som saknas, om inte `radon_measured` är `false` (avgör radon), `construction_year` och `living_area` som saknas, ett antal (`quantity`) som är uppskattat eller en mängd som saknas helt, kända driftkostnader som saknas och åtgärder utan kostnad. En yta eller längd uppskattad ur boytan frågas inte om, eftersom ingen mäter ett tak vid en visning. En driftkostnad som räknats fram ur energin, eller som är osäker, får sitt spann över horisonten som `swing`, och frågan gäller den faktiska kostnaden.

Ordningen är efter den största av de två summorna, sedan riskerna, sedan resten. Ett hus utan besiktningsprotokoll har `inspected: false`; ingen fråga ersätter en besiktning. En besvarad fråga försvinner, eftersom listan räknas fram vid läsning och inget sparas.

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

Koden ligger i `src/server/forecast/`: `plan.ts` räknar fram profil, installationsår, livslängd, mängd och kostnad per komponent en gång, så att prognosen (`forecast.ts`) och underhållsskulden (`debt.ts`) är överens; `running.ts` räknar driften och `run.ts` laddar huset, biblioteket, BKI och antagandena. Allt utom `run.ts` är rena funktioner med tester. Avgöranden utöver reglerna ovan:

- **Flaggor som koder.** Det prognosen säger om saknade, osäkra eller gissade indata är en kod med parametrar (`flags.ts`). Webben översätter koden; MCP-verktygen skickar den engelska texten, som Claude läser.

- **Tre scenarier.** `low`, `typical` och `high` räknas var för sig hela vägen, eftersom ett byte kan hamna på olika år i dem. `typical` tar medelvärdet av `costLowSek` och `costHighSek`.
- **Gissat installationsår.** Utan `installation_year` och `construction_year` är delen ny i `low`, halvvägs i `typical` och vid `lifespanMinYears` i `high`.
- **Mängd ur boytan.** Med `floor_count` räknas husets yta på marken som `living_area / floor_count` och dess omkrets som 4 × √ytan, ett kompakt rektangulärt hus som i KlarOfferts exempel (100 m² ger ungefär 40 m). `quantityFromFootprint` är en faktor gånger ytan (tak 1,3), omkretsen (dränering 1) eller omkretsen gånger våningarna (fasad 2,7, vägghöjd med gavlar och minus fönster, vald så att ett enplanshus får ungefär 1 m² fasad per m² boyta). Utan `floor_count` används `quantityPerLivingM2` gånger `living_area`. Uppskattningen avser hela huset. Det som typens övriga komponenter inte anger delas lika mellan dem som saknar mängd, så att ett hus vars underlag listar delar utan antal inte blir billigare. Blir andelen under 1 för `EACH` blir mängden 1 och flaggas; under 0 för yta och längd blir posten utan kostnad.
- **Bytesåtgärd.** En åtgärd med `kind: REPLACEMENT` på en komponent bestämmer komponentens första byte: året mitt i `yearMin`–`yearMax` och åtgärdens kostnad om den finns, annars profilens. Den räknas inte en gång till som åtgärd.
- **Åtgärder utan år eller kostnad.** Utan år läggs de ut efter sitt allvar (`severity`): `SEVERE` på startåret, `DEFECT` på 2 år, `RISK` på 4 och `MINOR` på 5 från startåret; utan allvar på startåret. Utan kostnad räknas de som noll. Alla flaggas.
- **Driften.** Prospektets poster i första hand (`heating_cost_sek_per_year`, `household_electricity_cost_sek_per_year`, `water_sewage_cost_sek_per_year`, `waste_cost_sek_per_year`, `insurance_cost_sek_per_year`, `chimney_sweeping_cost_sek_per_year`), och det som återstår av `operating_cost_sek_per_year` som en egen post. `property_fee_sek_per_year` är alltid en egen post. Uppvärmningen räknas fram bara när prospektet varken har en kostnad för den eller en total: `heating_kwh_per_year` gånger elpriset eller fjärrvärmepriset efter huvudsaklig uppvärmning, annars primärenergitalet gånger `living_area` gånger Fgeo delat med viktningsfaktorn (BBR 29: el 1,8, fjärrvärme 0,7). Spannet är 0 för säkra värden, ±20 % under `confidence` 0,7, ±15 % (±30 % om osäkert) för energi gånger pris och ±30 % för skattningen ur primärenergitalet.
- **Energipriser.** Användarens antagande, annars kommunens pris i `prisma/data/municipalities.mts`. Pellets har inget pris.
- **Drifttrend.** Medelvärdet av kommunens årliga förändringar i Nils Holgersson per kategori, ränta på ränta. VA, sophämtning, el (bara nätavgiften) och fjärrvärme trendas. Förändringarna är nominella medan prognosen är i startårets kronor, så trenden överdriver något.
- **Kapitalkostnad.** `interest_rate` gånger `loan_sek` varje år, utan amortering. Ränta utan lån flaggas och ger ingen kostnad.
- **Index.** Profilens pris förs från `priceYear` till startåret med årsmedel av BKI. Ett startår efter senaste data använder senaste året (`priceIndexYear` i svaret).
- **Ordning per år.** Varje scenario är en egen väg med egna bytesår, så ett enskilt år kan låg eller hög hamna på fel sida om typisk. Summorna är i ordning. Verktygsbeskrivningen säger det.
- **Luckor.** Svaret har `gaps` bredvid summorna: om det finns ett besiktningsprotokoll (`inspected`), åtgärder utan kostnad, antagna delar (`assumedParts`), dokumenterade delar med husets byggår som installationsår och delar utan kostnad, så att Claude säger vad summan saknar.
- **Ojämn redovisning.** Ett hus med besiktningsprotokoll har en lista med fel; ett hus utan har okända fel, inte inga. `compare` visar därför `inspectionFindings` per komponenttyp och hus, med `null` för ett hus utan protokoll, och beskrivningen säger åt Claude att ett fel i ett hus kan finnas också i ett obesiktigat. Felen läggs inte på det obesiktigade huset i kronor, eftersom det inte finns underlag för hur mycket en besiktning brukar hitta.
- **Inte med ännu.** Snöröjning och takskottning efter snözon, ställning vid fasadmålning. Verktygen säger det i `notModelled`.

## Byggordning

Varje milstolpe ska gå att visa i Claude eller i webbläsaren innan nästa påbörjas.

0. **Verifiera kopplingen.** Next.js-app med Better Auth (`mcp`, `cimd`, `jwt`), en seedad användare och en MCP-route med ett verktyg, körd över HTTPS. Läggs till som egen koppling i claude.ai med "Use Claude's published identity". Avgör protokollversion och om `legacy: "reject"` går att använda, och vilka sökvägar Better Auth använder, så att WAF- och Access-reglerna kan skrivas.
   - **HTTPS före k3s.** Anthropics servrar måste nå appen redan nu, men driften kommer i milstolpe 7. Den lokala appen exponeras därför med en Cloudflare Tunnel (`cloudflared`) på `dev.husvan.se`, med samma WAF-regel och Access som produktionen. `BETTER_AUTH_URL` och MCP-resursen pekar på dev-värden, och kopplingen i Claude heter `https://dev.husvan.se/api/mcp`. Eftersom `resource` måste vara exakt den adress som skrivs in läggs kopplingen till på nytt med `https://husvan.se/api/mcp` i milstolpe 7.
1. **Grund.** Prisma-schema och första migration, Compose med Postgres för lokal körning, Dockerfile och bygg-workflow, Vitest.
2. **Data.** Kommuner (Luleå 2580, Boden 2582), typbibliotek, livslängdsprofiler med källor, BKI-serie, områdesstatistik från Brå och SCB för Luleå och Boden. Det mest arbetskrävande steget, och det ligger inte i kod.
3. **Läsverktyg** mot seedad data: `list_houses`, `get_house`, `type_library`.
4. **Skrivverktyg** med utkast och godkännande.
5. **Prognos och jämförelse.**
6. **Webbsida**, först visning, sedan rättning och filuppladdning. Sist den publika startsidan.
7. **Drift i k3s.** Manifest och Kargo-pipeline i infra-gitops, databas och roll på den delade Postgres, första migration via port-forward, första manuella promotion. Därefter WAF-regeln för Anthropics IP-intervall och Access framför webben. Verifiera att Claude fortfarande kan ansluta och logga in när reglerna är på. När appen är klar tas Access bort och startsidan blir publik. WAF-regeln för MCP ligger kvar.

## Utanför version 1

Flera användare, ChatGPT-app, fakturainkorg, påminnelser, energikalkyl för fönsterbyten, delning, typskyltsigenkänning, händelser (service, reparation) och relationer mellan komponenter.

## Öppna frågor

- Kostar Boverkets API för energideklarationer något? (Kräver avtal som företag.)
- Fjärrvärme i Boden har inget pris per kWh: Bodens Energi publicerar bara tariffens delar. Ett hus där med fjärrvärme och bara energianvändning får ingen uppvärmningskostnad förrän användaren sätter `district_heating_price_sek_kwh`.
- Snöröjning och takskottning efter snözon saknar kostnadsdata och ingår inte i prognosen.
- Hur får huset sina koordinater, så att `deso_code` och snölasten kan räknas fram? Boverkets klimatlast-API ger `s_k` för en punkt (Luleå centrum 2,5 kN/m², resten av kommunen 3,0).

Besvarat i milstolpe 5:

- **Standardpriser för energi** ligger kvar i `prisma/data/municipalities.mts` med källor och används när användaren inte satt eget pris. `Assumption` behöver ingen nivå per kommun.
- **Ommålning** är en återkommande kostnad i profilen, se "Regler för beräkningen".

Besvarat i milstolpe 2:

- **Fgeo, DVUT och snözon** finns med källa i `prisma/data/municipalities.mts`. BBR upphävdes 2026-10-01 av BFS 2026:9, som behåller Fgeo per kommun (Luleå 1,5, Boden 1,6; Boden var 1,5 i BBR 29). Snölasten kommer ur BFS 2024:6, som ersatte EKS. DVUT gäller tidskonstanten ett dygn, vilket är en bedömning för ett lätt trähus.
- **SMHI:s Snötyngd** visar bara aktuell snölast och går inte att hämta som data. Boverkets klimatlast-API är källan i stället.
- **Pristyper.** Handelsbanken ger en klumpsumma och en livslängd per byggnadsdel för en genomsnittsvilla, med mycket eget arbete; den går bara att använda som `HOUSE`, eller `EACH` för kök och badrum. Planima skriver enheten i åtgärdens namn ("per st", m², m) och översätts till `EACH`, `M2` och `LINEAR_M`, men hela listan kräver konto. Villaägarnas öppna sidor ger nästan bara livslängder. Kostnaderna vilar därför mest på pris- och hantverkarsidor från 2025–2026.
- **Brå och SCB.** Se "Området".
- **Nils Holgersson** har ingen småhusvariant; tarifförändringarna gäller ett flerbostadshus med 15 lägenheter, och el avser bara nätavgiften.
