# Husvan

Husvan (husvan.se) är ett verktyg för att förstå vad ett hus kostar över tid.

- **Version 1: köpunderlag.** Ägaren lägger in hus han är intresserad av, ser kostnaden framåt och jämför husen.
- **Senare: underhåll.** När ett hus är köpt blir samma hus utgångspunkt för underhållsplan, påminnelser och kvitton. Inga data flyttas, huset får bara status `PURCHASED`.
- **Fullversion: hela Sverige.** Version 1 seedar bara Luleå och Boden, men ingen kod får anta det. Allt som skiljer mellan orter är referensdata nycklad på kommunkod, och en kommun utan data ger en flaggad post, inte ett fel.

Fullständig bakgrund, marknadsanalys och resonemang finns i dokumentet:
https://claude.ai/artifact/U5dP4Qjzr9PywekiWPKxp9

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
| Autentisering | **Better Auth** med pluginen `mcp` (OAuth 2.1-auktoriseringsserver i samma app), `cimd` och `jwt`. Ersätter NextAuth, som inte kan agera auktoriseringsserver. Inloggning med e-post och lösenord, registrering avstängd, en användare seedas. |
| Test | Vitest. |
| Drift | k3s på användarens VPS, styrt från `C:\projects\infra-gitops` med Argo CD, Kustomize, KSOPS och Kargo. `husvan.se` för webben, MCP på `https://husvan.se/api/mcp`. En värd, så att `/.well-known/*` och MCP-sökvägen delar ursprung. Se "Leverans och drift". |
| Lokal körning | `docker compose up -d postgres` och `yarn dev`, som i brfjamforelse. Compose innehåller Postgres och en valfri app-image för att testa containern; det är inte produktionsmiljön. |

Skillnader mot brfjamforelse: ingen organisationsmodell, inga kvoter, ingen egen AI-anropning, ingen publik yta. Det som inte behövs byggs inte.

### Leverans och drift

Manifesten följer standarden i infra-gitops (`apps/<app>/base` och `apps/<app>/envs/production`, upptäckta av ApplicationSet:et i `appsets/production.yaml`). Förebilden är `apps/brfjamforelse-se`.

- **Image.** GitHub Actions bygger och pushar `ghcr.io/c-pettersson/husvan` när en semver-tagg pushas, samma workflow som brfjamforelse. Dockerfile enligt brfjamforelse: Node 22 Alpine, flerstegsbygge, `prisma generate` vid bygget, `yarn start` på port 3000.
- **Manifest.** `apps/husvan-se/base` med Deployment (en replika, `envFrom` från Secret `husvan`, `imagePullSecrets: regcred`) och Service på 3000. `apps/husvan-se/envs/production` med Traefik-Ingress för `husvan.se`, `secrets.sops.yaml`, `registry-creds.sops.yaml` och `cloudflare-origin-certificate.sops.yaml`, alla krypterade med SOPS och age enligt `.sops.yaml`. Namnrymden blir `husvan-se-production`.
- **Release.** `kargo/pipelines/husvan-se` med Project, ProjectConfig (`autoPromotionEnabled: false`), Warehouse mot GHCR med semver-filter och en manuell `production`-stage som använder `kargo/base` PromotionTask. Promotion pinnar image-digest i `envs/production/kustomization.yaml`, committar till `main` och låter Argo CD synka. Lägg till appen i `scripts/lib/workloads.mjs` och kör `npm run validate` och `npm test` i infra-gitops.
- **Databas.** Den delade Bitnami-Postgres i namnrymden `default` (`postgres-postgresql.default.svc.cluster.local:5432`), med en egen databas `husvan` och en egen roll. Migrationer körs med `yarn prisma migrate deploy` mot databasen via port-forward, som i brfjamforelse. Ingen migration körs automatiskt vid podstart.
- **Dokumentfiler.** En PVC monterad på `UPLOADS_DIR`, eftersom appen har en replika. S3-kompatibel lagring (R2) är alternativet om PVC:n blir opraktisk, med samma inställningar som brfjamforelse.
- **Framför klustret.** Cloudflare som DNS-proxy med origin-certifikat i Ingress-TLS:en; Traefik litar redan på Cloudflares IP-intervall för vidarebefordrade headers. En WAF-regel släpper bara in Anthropics IP-intervall `160.79.104.0/21` till MCP-routen, token- och JWKS-endpoints och `/.well-known/*`. Cloudflare Access (bara ägarens e-post) framför alla andra sökvägar, alltså webbsidorna och OAuth-inloggningen. Exakta sökvägar fastställs i milstolpe 0 när Better Auths routes är kända. En Tailscale-Ingress som i brfjamforelse är valfri för privat åtkomst förbi Cloudflare.
- **Regel.** Inga direkta ändringar i klustret. Allt går via manifest i infra-gitops, commit, push och reconciliation i Argo CD. Samma regel som i det repots `AGENTS.md`.

### Autentisering: vad Claude kräver

Anthropics krav på en fjärr-MCP-server med OAuth (källa: claude.com/docs/connectors/building/authentication):

- Oautentiserat anrop ska ge `401` med `WWW-Authenticate: Bearer resource_metadata="https://husvan.se/.well-known/oauth-protected-resource"`. En `WWW-Authenticate` på `200` ignoreras.
- Dokumentets `resource` måste vara exakt den URL användaren skriver in i Claude, inklusive sökväg.
- Claude identifierar sig helst med **Client ID Metadata Document** ("Use Claude's published identity"). Det väljs bara om auktoriseringsserverns metadata har både `client_id_metadata_document_supported: true` och `"none"` i `token_endpoint_auth_methods_supported`. Annars faller Claude tillbaka på Dynamic Client Registration, som MCP-specifikationen 2026-07-28 avråder från. Vi kör CIMD och håller DCR avstängt.
- PKCE S256 på varje auktorisering, och `code_challenge_methods_supported: ["S256"]` i metadata.
- Redirect-URI för claude.ai, desktop och mobil: `https://claude.ai/api/mcp/auth_callback`. För Claude Code: loopback på godtycklig port, `localhost` och `127.0.0.1`.
- Refresh tokens roteras. Ogiltig refresh ger `invalid_grant`. Token-endpointen tar `application/x-www-form-urlencoded`.
- Discovery-, registrerings- och token-endpoints måste svara inom 10 sekunder.
- Anthropics utgående trafik kommer från `160.79.104.0/21`.

Better Auths `mcp`-plugin levererar detta: `/oauth2/*`, RFC 8414- och RFC 9728-metadata, JWKS, och `requireMcpAuth` som skyddar MCP-routen. **Öppen punkt:** pluginen är byggd för protokollprofilen 2026-07-28 och rekommenderar `legacy: "reject"` i SDK:t. Vi låser inte versionen förrän milstolpe 0 visat vilken protokollversion Claude förhandlar fram.

## Datamodell

Principerna, i den ordning de styr schemat:

1. **Fast kärna, dynamiska fakta.** `House` har ägare, adress, kommun, fastighetsbeteckning och status. `Component` har hus, typ, förälder, vad den ersätter och ett namn. Allt annat som Claude läser ut är en `Observation`: nyckel, värde, källa, dokument, säkerhet.
2. **Observationer, inte giltighetstider.** Att prospektet säger 1995 och besiktningen 2001 är inte en förändring över tid utan två påståenden. Därför finns ingen `valid_from`/`valid_to` på värden. Varje observation är en rad med `recordedAt`; det aktuella värdet väljs vid läsning. När något faktiskt byts ut är det komponentens livscykel som ändras, inte värdet.
3. **Bara tillägg.** Ingen rad uppdateras eller raderas. Ett bättre värde är en ny observation; ett felaktigt får `retractedAt`. En utbytt del är en ny `Component` med `replacesId` mot den gamla. Att en komponent är ersatt härleds, det lagras inte på den gamla raden.
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
| `MunicipalTaxRate` och `TaxParameter` per år | Skattesatser som kolumner på kommunen, nationella belopp som konstanter i koden | Takbeloppet för fastighetsavgiften ändras varje år och skattesatserna kan ändras. Med en rad per år och källa går en gammal prognos att förklara, och ett nytt år är en import, inte en release. |
| `LeaseholdPolicy` med `validFrom` | Friköpsandel som kolumn på kommunen | Policyn är ett politiskt beslut som ändras. Historiken behövs för att se vad som gällde, och metoden skiljer sig mellan kommuner (andel av marktaxeringsvärdet, marknadsvärde, inget friköp). |
| `yearMin`/`yearMax` på åtgärder | Ett `year` | Besiktningen säger "inom 1–3 år", aldrig ett årtal. |
| Inga tabeller för händelser och relationer mellan komponenter | Tabellerna med i schemat men oanvända | Oanvända tabeller är otestade gissningar. De läggs till med en migration när underhållsläget byggs. |
| `ownerId` på `House` redan nu | Lägga till vid flera användare | Better Auth ger ändå en användartabell, och en backfill senare kostar mer än en kolumn nu. |
| Prisma-namn (`PascalCase`-modeller, `camelCase`-fält, `UPPER_CASE`-enum) | snake_case-SQL | Samma som brfjamforelse. Attributnycklar och typnamn i datan är fortfarande snake_case. |

### Skrivflöde

| Verktyg | Ändringsset | Varför |
| --- | --- | --- |
| `create_house` | Huset skapas direkt. Alla utlästa värden läggs i ett `DRAFT` som returneras tillsammans med `houseId`. | Huset är ankaret som dokument och utkast hänger på. Kärnan är synlig i chatten och lätt att rätta. |
| `save_document` | `APPROVED` direkt. | Ett dokument är bevis, inte ett påstående om huset. Servern tolkar det inte. |
| `set_assumption` | `APPROVED` direkt. | Användarens eget val, uttalat i chatten. |
| `propose_changes`, `add_work_item` | `DRAFT` tills `confirm_changes`. | Påståenden om huset som Claude läst ut. |
| Rättning på webbsidan | `APPROVED` direkt med källa `USER`. | Användaren gör ändringen själv. |

`confirm_changes` tar `approve` eller `reject`. Avslagna rader finns kvar men syns aldrig. Utkast valideras mot typbiblioteket redan vid `propose_changes`, så att Claude får felet medan den har dokumentet framför sig.

### Konventioner

- Attributnycklar och typnamn i datan är engelska, ASCII i snake_case (`installation_year`, `underfloor_heating`).
- Datum i ISO 8601. Belopp i kronor (`Decimal`, suffix `Sek`). Enheter anges explicit (`m2`, `kWh`, `W/m2K`).
- Datatyper för attribut: `text`, `number` (med enhet), `year`, `date`, `choice` (lista), referens till `actor`, `document` eller `component`.
- Nycklar som prognosen läser och som därför måste heta lika i alla typer: `installation_year`, `condition` (1–5, 5 är nytt), `area` (m2), `length` (m), `quantity` (antal). På huset: `construction_year`, `living_area`, `heating_kwh_per_year`, `electricity_kwh_per_year`, `operating_cost_sek_per_year`, `asking_price_sek`, `tax_assessment_value_sek` (taxeringsvärde), `land_assessment_value_sek` (marktaxeringsvärde), `value_year` (värdeår), `mortgage_deeds_sek` (befintliga pantbrev), `tenure` (`freehold` eller `leasehold`, tomträtt), `ground_lessor` (upplåtare), `ground_rent_sek_per_year` (tomträttsavgäld), `ground_rent_revision_year` (nästa omreglering).
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

Biblioteket börjar med de delar som dominerar kostnaden för ett småhus. Varje typ får en `LifespanProfile` med källa innan den används.

Klimatskal: `roof_covering`, `facade`, `window`, `exterior_door`, `drainage`, `foundation_waterproofing`. Installationer: `heat_pump_air_water`, `heat_pump_ground`, `heat_pump_air_air`, `district_heating_substation`, `electric_boiler`, `pellet_boiler`, `wood_stove`, `chimney`, `ventilation_ftx`, `ventilation_exhaust`, `water_heater`, `water_pipes`, `sewer_pipes`, `electrical_installation`, `underfloor_heating`. Inomhus: `kitchen`, `bathroom`, `garage_door`.

Fönster registreras styck för styck när underlaget tillåter det, annars som en komponent `window` med `quantity`.

## MCP-verktyg i version 1

| Verktyg | Vad det gör | Läser/skriver |
| --- | --- | --- |
| `list_houses` | Alla hus med status och nyckeltal | Läser |
| `get_house` | Allt om ett hus: komponentträd, aktuella värden med källa och alternativ, dokument, åtgärder, öppna utkast. Valfritt per datum | Läser |
| `type_library` | Kända komponenttyper och deras attribut, så att Claude vet vad den ska leta efter | Läser |
| `create_house` | Nytt kandidathus. Kärnan sparas direkt, övriga uppgifter returneras som utkast | Skriver |
| `save_document` | Fulltext, metadata och Claudes tolkning. Originalfilen laddas upp via webben | Skriver |
| `propose_changes` | Nya komponenter och observationer, alla med källa. Returnerar ett utkast | Skriver utkast |
| `confirm_changes` | Godkänner eller avslår ett utkast | Skriver |
| `add_work_item` | Åtgärd från besiktningen eller eget val | Skriver utkast |
| `set_assumption` | Horisont, startår, ränta, lån, antal låntagare, energipriser, drifttrend, köpeskilling, hushållets inkomst, friköpsår | Skriver |
| `forecast` | Kostnad per år och post för ett hus | Läser |
| `compare` | Flera hus sida vid sida, med de största skillnaderna först | Läser |

Verktygens beskrivningar och svar till Claude är på engelska. Claude svarar ändå användaren på svenska.

Validera allt som skrivs. Fakturor och prospekt kan innehålla dolda instruktioner, så allt innehåll från dokument behandlas som data.

## Kostnadsprognos

Per hus och år över vald horisont, i startårets kronor:

1. **Byten enligt livslängd.** Bytesår = installationsår + livslängd, justerat efter skick. Kostnad = profilens pris × mängd, uppräknat från prisår till startår med byggkostnadsindex.
2. **Åtgärder från besiktning och prospekt.** Engångsposter, utlagda jämnt över `yearMin`–`yearMax`.
3. **Drift.** Uppvärmning, el, VA, sophämtning, försäkring, sotning. Från prospektet eller energideklarationen, trendat per kommun om användaren valt det.
4. **Regionalt.** Snöröjning och takskottning efter snözon. Saknas energidata: grov skattning av uppvärmning med Fgeo.
5. **Kapitalkostnad (valfri).** Ränta på lånet med användarens ränta, minus ränteavdrag.
6. **Skatter och avgifter.** Fastighetsavgift varje år. Lagfart och pantbrev som engångsposter startåret. Tomträttsavgäld så länge huset står på tomträtt, och friköp om användaren valt ett friköpsår. Kommunalskatt bara om användaren angett hushållets inkomst.

Resultat: kostnad per år och post, summa, snitt per månad och ett spann (låg–hög) som blir bredare ju fler värden som saknas eller är osäkra. Jämförelsen visar först de poster som skiljer mest. Prognoser sparas så att man ser hur bedömningen av ett hus ändras.

### Regler för beräkningen

- **Installationsår** är observationen `installation_year` på komponenten, annars husets `construction_year`. Saknas båda markeras posten som gissad och spannet breddas till hela livslängdsintervallet.
- **Mängd** följer profilens `costUnit`: `M2` läser `area`, `LINEAR_M` läser `length`, `EACH` läser `quantity` (standard 1), `HOUSE` är alltid 1. Saknas mängden används typens `quantityPerLivingM2` gånger `living_area` om det finns, annars markeras posten som gissad.
- **Skick** flyttar bytesåret. Standardregel, justerbar per typ i `forecastDefaults`: skick 5 använder `lifespanMaxYears`, 4 och 3 `lifespanTypicalYears`, 2 `lifespanMinYears`, 1 byte inom två år. Utan skick används `lifespanTypicalYears`.
- **Passerad livslängd** ger inte ett byte i det förflutna. Bytesår före startåret läggs på startåret och flaggas.
- **Spann.** Låg använder `lifespanMaxYears` och `costLowSek`, hög använder `lifespanMinYears` och `costHighSek`. Varje post bär en lista över indata som saknas eller har `confidence` under 0,7.
- **Standardantaganden** när användaren inte satt egna: horisont 15 år, startår innevarande år, ingen kapitalkostnad, ingen drifttrend, köpeskilling lika med `asking_price_sek`, en låntagare, inget friköp, ingen kommunalskatt.
- **Skatteparametrar** hämtas ur `TaxParameter` för det senaste året till och med startåret och hålls fasta över horisonten, eftersom prognosen räknas i startårets kronor. Samma sak gäller `MunicipalTaxRate`.
- **Fastighetsavgift** är `property_fee_rate` × `tax_assessment_value_sek`, högst `property_fee_cap_sek`. Hus med `value_year` från `property_fee_exempt_from_value_year` och framåt betalar inget de första `property_fee_exempt_years` åren efter värdeåret. Startåret är avgiften noll, eftersom den som äger huset 1 januari betalar hela året. Samma regler gäller hus på tomträtt. Saknas taxeringsvärdet används taket och posten markeras som gissad.
- **Lagfart** är `title_stamp_duty_rate` × köpeskillingen plus `title_fee_sek`. **Pantbrev** är `mortgage_deed_stamp_duty_rate` × den del av lånet som befintliga pantbrev inte täcker, plus `mortgage_deed_fee_sek`. Inget nytt pantbrev, ingen avgift. Saknas `mortgage_deeds_sek` räknas med noll och posten markeras som gissad.
- **Tomträttsavgäld** följer `ground_rent_sek_per_year` fram till `ground_rent_revision_year`. Därefter ligger samma belopp kvar men markeras som osäkert, eftersom den nya avgälden inte går att räkna ut i förväg.
- **Friköp** följer kommunens `LeaseholdPolicy` på friköpsdagen. `LAND_ASSESSMENT_SHARE` ger `buyoutFactor` × `land_assessment_value_sek`, plus lagfart på friköpspriset. Avgälden upphör från friköpsåret. Gäller bara när kommunen är upplåtare. Vid `MARKET_VALUE`, annan upplåtare eller saknad policy visas friköpet som okänt med en flagga.
- **Ränteavdrag** är `interest_deduction_rate` på räntan och tomträttsavgälden upp till `interest_deduction_limit_sek` per låntagare, och `interest_deduction_reduced_rate` på resten.
- **Kommunalskatt** är hushållets inkomst × (`municipalRate` + `regionalRate`). Jämförelsen visar bara skillnaden mellan husen, eftersom inkomstskatten betalas oavsett hus. Begravnings- och kyrkoavgift räknas inte med.

## Byggordning

Varje milstolpe ska gå att visa i Claude eller i webbläsaren innan nästa påbörjas.

0. **Verifiera kopplingen.** Next.js-app med Better Auth (`mcp`, `cimd`, `jwt`), en seedad användare och en MCP-route med ett verktyg, körd över HTTPS. Läggs till som egen koppling i claude.ai med "Use Claude's published identity". Avgör protokollversion och om `legacy: "reject"` går att använda.
1. **Grund.** Prisma-schema och första migration, Compose med Postgres för lokal körning, Dockerfile och bygg-workflow, Vitest.
2. **Data.** Kommuner (Luleå 2580, Boden 2582), typbibliotek, livslängdsprofiler med källor, BKI-serie, skatteparametrar och tomträttspolicyer för båda kommunerna. Kommunalskatten importeras för alla 290 kommuner från SCB:s årstabell, eftersom det kostar lika lite som att importera två. Det mest arbetskrävande steget, och det ligger inte i kod.
3. **Läsverktyg** mot seedad data: `list_houses`, `get_house`, `type_library`.
4. **Skrivverktyg** med utkast och godkännande.
5. **Prognos och jämförelse.**
6. **Webbsida**, först visning, sedan rättning och filuppladdning.
7. **Drift i k3s.** Manifest och Kargo-pipeline i infra-gitops, databas och roll på den delade Postgres, första migration via port-forward, första manuella promotion. Därefter WAF-regeln för Anthropics IP-intervall och Access framför webben. Verifiera att Claude fortfarande kan ansluta och logga in när reglerna är på.

## Utanför version 1

Flera användare, ChatGPT-app, fakturainkorg, påminnelser, energikalkyl för fönsterbyten, delning, typskyltsigenkänning, händelser (service, reparation) och relationer mellan komponenter.

## Öppna frågor

- Vilken MCP-protokollversion förhandlar Claude fram mot en server byggd på SDK v2? Avgörs i milstolpe 0.
- Kostar Boverkets API för energideklarationer något? (Kräver avtal som företag.)
- Går SMHI:s Snötyngd att hämta som data?
- Fgeo, DVUT och snözon för Luleå och Boden med källa (BBR-tabell), samt standardvärden för energipriser.
- Vilka pristyper i Handelsbankens, Planimas och Villaägarnas underlag går att översätta till `costUnit`?
- Följer pantbreven i en tomträtt med till fastigheten vid friköp, eller måste nya tas ut? Avgör om friköpet kostar stämpelskatt för pantbrev.
- Tomträttspolicyer för hela Sverige saknar en nationell källa. Hur samlas och hålls 290 kommuners policyer aktuella i fullversionen?
