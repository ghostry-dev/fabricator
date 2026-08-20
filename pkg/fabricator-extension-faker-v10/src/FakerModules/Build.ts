/**
 * Every builder in the mirror's module half, written out one per faker method,
 * hand-maintained alongside `./Types.ts`.
 *
 * **The `FakerModules` return annotation is the point of the file.** It checks
 * each expression against the property `./Types.ts` declares for the same
 * method, so contract and implementation cannot drift silently — no cast
 * anywhere in this package's construction path. See `./Types.ts`'s header for
 * the faker-bump workflow; an entry added or changed here needs the matching
 * edit there, and vice versa.
 *
 * Three shapes before editing:
 *
 * - Every builder spreads faker's `Parameters<...>` rather than taking a single
 *   `options?`. Faker's zero-parameter methods (`animal.bear()`) and its
 *   optional-parameter ones (`date.past(options?)`) are indistinguishable at
 *   runtime — both report `.length === 0`, and `toString()` is `[native code]`
 *   because faker binds them — and the spread is exact for both, for the three
 *   methods whose first argument is required, and for `string.fromCharacters`'s
 *   second parameter.
 * - An object-kind builder's string fields are the shared `string` placeholder:
 *   the enclosing `.as(produce)` supplies the whole value and no field is ever
 *   drawn on its own. See its own doc for why it exists and why it is a
 *   producer rather than a length bound.
 * - `color`'s 7 split methods are a `{ text, channels }` pair each rather than
 *   one ambiguous builder, since their return type depends on their arguments;
 *   see the deviation policy in `CLAUDE.md`'s "The faker extension". All 7 name
 *   `format: "decimal"` on `.channels()`, not only `rgb`: bare is right at
 *   runtime for the other 6, but not provable through faker's declarations,
 *   whose _first_ overload takes `format?: StringColorFormat` and returns
 *   `string`. `'decimal'` is `NumberColorFormat`'s sole member, so naming it is
 *   exact.
 *
 * Every node is a plain object or a bare builder function, never a function
 * carrying properties — the invariant `deepMerge` needs to recurse through an
 * extended registry, guarded by `test/Mergeable.test.ts`.
 */
import type { Faker } from "@faker-js/faker";
import type { ProduceContext } from "@ghostry/fabricator";
import type { Registry } from "../Types";
import type { FakerModules } from "./Types";

/**
 * `src/index.ts`'s `draw`, by type — the save/restore wrapper that binds a
 * producer to the leaf's own `random`/`clock`. Named here rather than imported
 * so this file stays type-only in its dependencies.
 */
type Draw = <$T>(produce: () => $T) => (context: ProduceContext) => $T;

export function build(T: Registry, faker: Faker, draw: Draw): FakerModules {
  const [f, d] = [faker, draw];

  /**
   * A string field inside an object builder whose own `.as(produce)` supplies
   * the whole value — every field of every `T.object(...)` below.
   *
   * Still has to be a valid Schema: `Constructor.ts` dispatches an object's
   * fields at construction, before any `produce` short-circuit applies, and
   * `T.string` has no bare form (`CLAUDE.md`'s "Not every kind has a bare
   * form") — a bare one throws on `meta.produce` of `undefined`. `T.number`
   * needs no equivalent, which is why `atomicNumber` and friends are written
   * plainly.
   *
   * `.as()` rather than a `whereby` length bound: a bound would claim a maximum
   * length these values have no reason to respect — inert against today's
   * TypeBox adapter, which reads `[Meta].hints` and never `whereby`, but
   * `whereby` is carried forward through `.as()` for future validation, so the
   * claim would eventually be read, and be wrong. A producer claims nothing
   * about the value, and both forms convert to `{"type":"string"}`.
   *
   * This producer is never called: `object/Fabricator.ts` short-circuits on the
   * enclosing schema's `produce` before any field is fabricated. One shared
   * instance rather than 17 identical ones is safe for that reason, and would
   * be regardless — a Schema is inert, and a leaf's stream is keyed by
   * structural path, not by the identity of the Schema object at it.
   */
  const string = T.string.as(() => "");

  return {
    airline: {
      aircraftType: (...args: Parameters<Faker["airline"]["aircraftType"]>) =>
        T.enum
          .uniform(["narrowbody", "regional", "widebody"])
          .as(d(() => f.airline.aircraftType(...args))),
      airline: (...args: Parameters<Faker["airline"]["airline"]>) =>
        T.object({ name: string, iataCode: string }).as(
          d(() => f.airline.airline(...args)),
        ),
      airplane: (...args: Parameters<Faker["airline"]["airplane"]>) =>
        T.object({ name: string, iataTypeCode: string }).as(
          d(() => f.airline.airplane(...args)),
        ),
      airport: (...args: Parameters<Faker["airline"]["airport"]>) =>
        T.object({ name: string, iataCode: string }).as(
          d(() => f.airline.airport(...args)),
        ),
      flightNumber: (...args: Parameters<Faker["airline"]["flightNumber"]>) =>
        T.string.as(d(() => f.airline.flightNumber(...args))),
      recordLocator: (...args: Parameters<Faker["airline"]["recordLocator"]>) =>
        T.string.as(d(() => f.airline.recordLocator(...args))),
      seat: (...args: Parameters<Faker["airline"]["seat"]>) =>
        T.string.as(d(() => f.airline.seat(...args))),
    },
    animal: {
      bear: (...args: Parameters<Faker["animal"]["bear"]>) =>
        T.string.as(d(() => f.animal.bear(...args))),
      bird: (...args: Parameters<Faker["animal"]["bird"]>) =>
        T.string.as(d(() => f.animal.bird(...args))),
      cat: (...args: Parameters<Faker["animal"]["cat"]>) =>
        T.string.as(d(() => f.animal.cat(...args))),
      cetacean: (...args: Parameters<Faker["animal"]["cetacean"]>) =>
        T.string.as(d(() => f.animal.cetacean(...args))),
      cow: (...args: Parameters<Faker["animal"]["cow"]>) =>
        T.string.as(d(() => f.animal.cow(...args))),
      crocodilia: (...args: Parameters<Faker["animal"]["crocodilia"]>) =>
        T.string.as(d(() => f.animal.crocodilia(...args))),
      dog: (...args: Parameters<Faker["animal"]["dog"]>) =>
        T.string.as(d(() => f.animal.dog(...args))),
      fish: (...args: Parameters<Faker["animal"]["fish"]>) =>
        T.string.as(d(() => f.animal.fish(...args))),
      horse: (...args: Parameters<Faker["animal"]["horse"]>) =>
        T.string.as(d(() => f.animal.horse(...args))),
      insect: (...args: Parameters<Faker["animal"]["insect"]>) =>
        T.string.as(d(() => f.animal.insect(...args))),
      lion: (...args: Parameters<Faker["animal"]["lion"]>) =>
        T.string.as(d(() => f.animal.lion(...args))),
      petName: (...args: Parameters<Faker["animal"]["petName"]>) =>
        T.string.as(d(() => f.animal.petName(...args))),
      rabbit: (...args: Parameters<Faker["animal"]["rabbit"]>) =>
        T.string.as(d(() => f.animal.rabbit(...args))),
      rodent: (...args: Parameters<Faker["animal"]["rodent"]>) =>
        T.string.as(d(() => f.animal.rodent(...args))),
      snake: (...args: Parameters<Faker["animal"]["snake"]>) =>
        T.string.as(d(() => f.animal.snake(...args))),
      type: (...args: Parameters<Faker["animal"]["type"]>) =>
        T.string.as(d(() => f.animal.type(...args))),
    },
    book: {
      author: (...args: Parameters<Faker["book"]["author"]>) =>
        T.string.as(d(() => f.book.author(...args))),
      format: (...args: Parameters<Faker["book"]["format"]>) =>
        T.string.as(d(() => f.book.format(...args))),
      genre: (...args: Parameters<Faker["book"]["genre"]>) =>
        T.string.as(d(() => f.book.genre(...args))),
      publisher: (...args: Parameters<Faker["book"]["publisher"]>) =>
        T.string.as(d(() => f.book.publisher(...args))),
      series: (...args: Parameters<Faker["book"]["series"]>) =>
        T.string.as(d(() => f.book.series(...args))),
      title: (...args: Parameters<Faker["book"]["title"]>) =>
        T.string.as(d(() => f.book.title(...args))),
    },
    color: {
      cssSupportedFunction: (
        ...args: Parameters<Faker["color"]["cssSupportedFunction"]>
      ) =>
        T.enum
          .uniform([
            "rgb",
            "rgba",
            "hsl",
            "hsla",
            "hwb",
            "cmyk",
            "lab",
            "lch",
            "color",
          ])
          .as(d(() => f.color.cssSupportedFunction(...args))),
      cssSupportedSpace: (
        ...args: Parameters<Faker["color"]["cssSupportedSpace"]>
      ) =>
        T.enum
          .uniform(["sRGB", "display-p3", "rec2020", "a98-rgb", "prophoto-rgb"])
          .as(d(() => f.color.cssSupportedSpace(...args))),
      human: (...args: Parameters<Faker["color"]["human"]>) =>
        T.string.as(d(() => f.color.human(...args))),
      space: (...args: Parameters<Faker["color"]["space"]>) =>
        T.string.as(d(() => f.color.space(...args))),
      rgb: {
        text: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["rgb"]>[0]>,
            "format"
          >,
        ) => T.string.as(d(() => f.color.rgb({ format: "css", ...options }))),
        channels: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["rgb"]>[0]>,
            "format"
          >,
        ) =>
          T.array(T.number).as(
            d(() => f.color.rgb({ ...options, format: "decimal" })),
          ),
      },
      cmyk: {
        text: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["cmyk"]>[0]>,
            "format"
          >,
        ) => T.string.as(d(() => f.color.cmyk({ format: "css", ...options }))),
        channels: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["cmyk"]>[0]>,
            "format"
          >,
        ) =>
          T.array(T.number).as(
            d(() => f.color.cmyk({ ...options, format: "decimal" })),
          ),
      },
      hsl: {
        text: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["hsl"]>[0]>,
            "format"
          >,
        ) => T.string.as(d(() => f.color.hsl({ format: "css", ...options }))),
        channels: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["hsl"]>[0]>,
            "format"
          >,
        ) =>
          T.array(T.number).as(
            d(() => f.color.hsl({ ...options, format: "decimal" })),
          ),
      },
      hwb: {
        text: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["hwb"]>[0]>,
            "format"
          >,
        ) => T.string.as(d(() => f.color.hwb({ format: "css", ...options }))),
        channels: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["hwb"]>[0]>,
            "format"
          >,
        ) =>
          T.array(T.number).as(
            d(() => f.color.hwb({ ...options, format: "decimal" })),
          ),
      },
      lab: {
        text: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["lab"]>[0]>,
            "format"
          >,
        ) => T.string.as(d(() => f.color.lab({ format: "css", ...options }))),
        channels: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["lab"]>[0]>,
            "format"
          >,
        ) =>
          T.array(T.number).as(
            d(() => f.color.lab({ ...options, format: "decimal" })),
          ),
      },
      lch: {
        text: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["lch"]>[0]>,
            "format"
          >,
        ) => T.string.as(d(() => f.color.lch({ format: "css", ...options }))),
        channels: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["lch"]>[0]>,
            "format"
          >,
        ) =>
          T.array(T.number).as(
            d(() => f.color.lch({ ...options, format: "decimal" })),
          ),
      },
      colorByCSSColorSpace: {
        text: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["colorByCSSColorSpace"]>[0]>,
            "format"
          >,
        ) =>
          T.string.as(
            d(() =>
              f.color.colorByCSSColorSpace({ format: "css", ...options }),
            ),
          ),
        channels: (
          options?: Omit<
            NonNullable<Parameters<Faker["color"]["colorByCSSColorSpace"]>[0]>,
            "format"
          >,
        ) =>
          T.array(T.number).as(
            d(() =>
              f.color.colorByCSSColorSpace({ ...options, format: "decimal" }),
            ),
          ),
      },
    },
    commerce: {
      department: (...args: Parameters<Faker["commerce"]["department"]>) =>
        T.string.as(d(() => f.commerce.department(...args))),
      isbn: (...args: Parameters<Faker["commerce"]["isbn"]>) =>
        T.string.as(d(() => f.commerce.isbn(...args))),
      price: (...args: Parameters<Faker["commerce"]["price"]>) =>
        T.string.as(d(() => f.commerce.price(...args))),
      product: (...args: Parameters<Faker["commerce"]["product"]>) =>
        T.string.as(d(() => f.commerce.product(...args))),
      productAdjective: (
        ...args: Parameters<Faker["commerce"]["productAdjective"]>
      ) => T.string.as(d(() => f.commerce.productAdjective(...args))),
      productDescription: (
        ...args: Parameters<Faker["commerce"]["productDescription"]>
      ) => T.string.as(d(() => f.commerce.productDescription(...args))),
      productMaterial: (
        ...args: Parameters<Faker["commerce"]["productMaterial"]>
      ) => T.string.as(d(() => f.commerce.productMaterial(...args))),
      productName: (...args: Parameters<Faker["commerce"]["productName"]>) =>
        T.string.as(d(() => f.commerce.productName(...args))),
      upc: (...args: Parameters<Faker["commerce"]["upc"]>) =>
        T.string.as(d(() => f.commerce.upc(...args))),
    },
    company: {
      buzzAdjective: (...args: Parameters<Faker["company"]["buzzAdjective"]>) =>
        T.string.as(d(() => f.company.buzzAdjective(...args))),
      buzzNoun: (...args: Parameters<Faker["company"]["buzzNoun"]>) =>
        T.string.as(d(() => f.company.buzzNoun(...args))),
      buzzPhrase: (...args: Parameters<Faker["company"]["buzzPhrase"]>) =>
        T.string.as(d(() => f.company.buzzPhrase(...args))),
      buzzVerb: (...args: Parameters<Faker["company"]["buzzVerb"]>) =>
        T.string.as(d(() => f.company.buzzVerb(...args))),
      catchPhrase: (...args: Parameters<Faker["company"]["catchPhrase"]>) =>
        T.string.as(d(() => f.company.catchPhrase(...args))),
      catchPhraseAdjective: (
        ...args: Parameters<Faker["company"]["catchPhraseAdjective"]>
      ) => T.string.as(d(() => f.company.catchPhraseAdjective(...args))),
      catchPhraseDescriptor: (
        ...args: Parameters<Faker["company"]["catchPhraseDescriptor"]>
      ) => T.string.as(d(() => f.company.catchPhraseDescriptor(...args))),
      catchPhraseNoun: (
        ...args: Parameters<Faker["company"]["catchPhraseNoun"]>
      ) => T.string.as(d(() => f.company.catchPhraseNoun(...args))),
      name: (...args: Parameters<Faker["company"]["name"]>) =>
        T.string.as(d(() => f.company.name(...args))),
    },
    database: {
      collation: (...args: Parameters<Faker["database"]["collation"]>) =>
        T.string.as(d(() => f.database.collation(...args))),
      column: (...args: Parameters<Faker["database"]["column"]>) =>
        T.string.as(d(() => f.database.column(...args))),
      engine: (...args: Parameters<Faker["database"]["engine"]>) =>
        T.string.as(d(() => f.database.engine(...args))),
      mongodbObjectId: (
        ...args: Parameters<Faker["database"]["mongodbObjectId"]>
      ) =>
        T.string.as(
          d(() => f.database.mongodbObjectId(...args)),
          { pattern: "^[0-9a-fA-F]{24}$" },
        ),
      type: (...args: Parameters<Faker["database"]["type"]>) =>
        T.string.as(d(() => f.database.type(...args))),
    },
    datatype: {
      boolean: (...args: Parameters<Faker["datatype"]["boolean"]>) =>
        T.boolean.as(d(() => f.datatype.boolean(...args))),
    },
    date: {
      anytime: (...args: Parameters<Faker["date"]["anytime"]>) =>
        T.date.as(d(() => f.date.anytime(...args))),
      between: (...args: Parameters<Faker["date"]["between"]>) =>
        T.date.as(d(() => f.date.between(...args))),
      betweens: (...args: Parameters<Faker["date"]["betweens"]>) =>
        T.array(T.date).as(d(() => f.date.betweens(...args))),
      birthdate: (...args: Parameters<Faker["date"]["birthdate"]>) =>
        T.date.as(d(() => f.date.birthdate(...args))),
      future: (...args: Parameters<Faker["date"]["future"]>) =>
        T.date.as(d(() => f.date.future(...args))),
      month: (...args: Parameters<Faker["date"]["month"]>) =>
        T.string.as(d(() => f.date.month(...args))),
      past: (...args: Parameters<Faker["date"]["past"]>) =>
        T.date.as(d(() => f.date.past(...args))),
      recent: (...args: Parameters<Faker["date"]["recent"]>) =>
        T.date.as(d(() => f.date.recent(...args))),
      soon: (...args: Parameters<Faker["date"]["soon"]>) =>
        T.date.as(d(() => f.date.soon(...args))),
      timeZone: (...args: Parameters<Faker["date"]["timeZone"]>) =>
        T.string.as(d(() => f.date.timeZone(...args))),
      weekday: (...args: Parameters<Faker["date"]["weekday"]>) =>
        T.string.as(d(() => f.date.weekday(...args))),
    },
    finance: {
      accountName: (...args: Parameters<Faker["finance"]["accountName"]>) =>
        T.string.as(d(() => f.finance.accountName(...args))),
      accountNumber: (...args: Parameters<Faker["finance"]["accountNumber"]>) =>
        T.string.as(d(() => f.finance.accountNumber(...args))),
      amount: (...args: Parameters<Faker["finance"]["amount"]>) =>
        T.string.as(d(() => f.finance.amount(...args))),
      bic: (...args: Parameters<Faker["finance"]["bic"]>) =>
        T.string.as(
          d(() => f.finance.bic(...args)),
          { pattern: "^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$" },
        ),
      bitcoinAddress: (
        ...args: Parameters<Faker["finance"]["bitcoinAddress"]>
      ) => T.string.as(d(() => f.finance.bitcoinAddress(...args))),
      creditCardCVV: (...args: Parameters<Faker["finance"]["creditCardCVV"]>) =>
        T.string.as(
          d(() => f.finance.creditCardCVV(...args)),
          { pattern: "^[0-9]{3,4}$" },
        ),
      creditCardIssuer: (
        ...args: Parameters<Faker["finance"]["creditCardIssuer"]>
      ) => T.string.as(d(() => f.finance.creditCardIssuer(...args))),
      creditCardNumber: (
        ...args: Parameters<Faker["finance"]["creditCardNumber"]>
      ) => T.string.as(d(() => f.finance.creditCardNumber(...args))),
      currency: (...args: Parameters<Faker["finance"]["currency"]>) =>
        T.object({
          name: string,
          code: string,
          symbol: string,
          numericCode: string,
        }).as(d(() => f.finance.currency(...args))),
      currencyCode: (...args: Parameters<Faker["finance"]["currencyCode"]>) =>
        T.string.as(d(() => f.finance.currencyCode(...args))),
      currencyName: (...args: Parameters<Faker["finance"]["currencyName"]>) =>
        T.string.as(d(() => f.finance.currencyName(...args))),
      currencyNumericCode: (
        ...args: Parameters<Faker["finance"]["currencyNumericCode"]>
      ) => T.string.as(d(() => f.finance.currencyNumericCode(...args))),
      currencySymbol: (
        ...args: Parameters<Faker["finance"]["currencySymbol"]>
      ) => T.string.as(d(() => f.finance.currencySymbol(...args))),
      ethereumAddress: (
        ...args: Parameters<Faker["finance"]["ethereumAddress"]>
      ) => T.string.as(d(() => f.finance.ethereumAddress(...args))),
      iban: (...args: Parameters<Faker["finance"]["iban"]>) =>
        T.string.as(d(() => f.finance.iban(...args))),
      litecoinAddress: (
        ...args: Parameters<Faker["finance"]["litecoinAddress"]>
      ) => T.string.as(d(() => f.finance.litecoinAddress(...args))),
      pin: (...args: Parameters<Faker["finance"]["pin"]>) =>
        T.string.as(d(() => f.finance.pin(...args))),
      routingNumber: (...args: Parameters<Faker["finance"]["routingNumber"]>) =>
        T.string.as(d(() => f.finance.routingNumber(...args))),
      transactionDescription: (
        ...args: Parameters<Faker["finance"]["transactionDescription"]>
      ) => T.string.as(d(() => f.finance.transactionDescription(...args))),
      transactionType: (
        ...args: Parameters<Faker["finance"]["transactionType"]>
      ) => T.string.as(d(() => f.finance.transactionType(...args))),
    },
    food: {
      adjective: (...args: Parameters<Faker["food"]["adjective"]>) =>
        T.string.as(d(() => f.food.adjective(...args))),
      description: (...args: Parameters<Faker["food"]["description"]>) =>
        T.string.as(d(() => f.food.description(...args))),
      dish: (...args: Parameters<Faker["food"]["dish"]>) =>
        T.string.as(d(() => f.food.dish(...args))),
      ethnicCategory: (...args: Parameters<Faker["food"]["ethnicCategory"]>) =>
        T.string.as(d(() => f.food.ethnicCategory(...args))),
      fruit: (...args: Parameters<Faker["food"]["fruit"]>) =>
        T.string.as(d(() => f.food.fruit(...args))),
      ingredient: (...args: Parameters<Faker["food"]["ingredient"]>) =>
        T.string.as(d(() => f.food.ingredient(...args))),
      meat: (...args: Parameters<Faker["food"]["meat"]>) =>
        T.string.as(d(() => f.food.meat(...args))),
      spice: (...args: Parameters<Faker["food"]["spice"]>) =>
        T.string.as(d(() => f.food.spice(...args))),
      vegetable: (...args: Parameters<Faker["food"]["vegetable"]>) =>
        T.string.as(d(() => f.food.vegetable(...args))),
    },
    git: {
      branch: (...args: Parameters<Faker["git"]["branch"]>) =>
        T.string.as(d(() => f.git.branch(...args))),
      commitDate: (...args: Parameters<Faker["git"]["commitDate"]>) =>
        T.string.as(d(() => f.git.commitDate(...args))),
      commitEntry: (...args: Parameters<Faker["git"]["commitEntry"]>) =>
        T.string.as(d(() => f.git.commitEntry(...args))),
      commitMessage: (...args: Parameters<Faker["git"]["commitMessage"]>) =>
        T.string.as(d(() => f.git.commitMessage(...args))),
      commitSha: (...args: Parameters<Faker["git"]["commitSha"]>) =>
        T.string.as(d(() => f.git.commitSha(...args))),
    },
    hacker: {
      abbreviation: (...args: Parameters<Faker["hacker"]["abbreviation"]>) =>
        T.string.as(d(() => f.hacker.abbreviation(...args))),
      adjective: (...args: Parameters<Faker["hacker"]["adjective"]>) =>
        T.string.as(d(() => f.hacker.adjective(...args))),
      ingverb: (...args: Parameters<Faker["hacker"]["ingverb"]>) =>
        T.string.as(d(() => f.hacker.ingverb(...args))),
      noun: (...args: Parameters<Faker["hacker"]["noun"]>) =>
        T.string.as(d(() => f.hacker.noun(...args))),
      phrase: (...args: Parameters<Faker["hacker"]["phrase"]>) =>
        T.string.as(d(() => f.hacker.phrase(...args))),
      verb: (...args: Parameters<Faker["hacker"]["verb"]>) =>
        T.string.as(d(() => f.hacker.verb(...args))),
    },
    image: {
      avatar: (...args: Parameters<Faker["image"]["avatar"]>) =>
        T.string.as(
          d(() => f.image.avatar(...args)),
          { format: "uri" },
        ),
      avatarGitHub: (...args: Parameters<Faker["image"]["avatarGitHub"]>) =>
        T.string.as(
          d(() => f.image.avatarGitHub(...args)),
          { format: "uri" },
        ),
      dataUri: (...args: Parameters<Faker["image"]["dataUri"]>) =>
        T.string.as(
          d(() => f.image.dataUri(...args)),
          { format: "uri" },
        ),
      personPortrait: (...args: Parameters<Faker["image"]["personPortrait"]>) =>
        T.string.as(
          d(() => f.image.personPortrait(...args)),
          { format: "uri" },
        ),
      url: (...args: Parameters<Faker["image"]["url"]>) =>
        T.string.as(
          d(() => f.image.url(...args)),
          { format: "uri" },
        ),
      urlLoremFlickr: (...args: Parameters<Faker["image"]["urlLoremFlickr"]>) =>
        T.string.as(d(() => f.image.urlLoremFlickr(...args))),
      urlPicsumPhotos: (
        ...args: Parameters<Faker["image"]["urlPicsumPhotos"]>
      ) =>
        T.string.as(
          d(() => f.image.urlPicsumPhotos(...args)),
          { format: "uri" },
        ),
    },
    internet: {
      displayName: (...args: Parameters<Faker["internet"]["displayName"]>) =>
        T.string.as(d(() => f.internet.displayName(...args))),
      domainName: (...args: Parameters<Faker["internet"]["domainName"]>) =>
        T.string.as(
          d(() => f.internet.domainName(...args)),
          { format: "hostname" },
        ),
      domainSuffix: (...args: Parameters<Faker["internet"]["domainSuffix"]>) =>
        T.string.as(d(() => f.internet.domainSuffix(...args))),
      domainWord: (...args: Parameters<Faker["internet"]["domainWord"]>) =>
        T.string.as(d(() => f.internet.domainWord(...args))),
      email: (...args: Parameters<Faker["internet"]["email"]>) =>
        T.string.as(
          d(() => f.internet.email(...args)),
          { format: "email" },
        ),
      emoji: (...args: Parameters<Faker["internet"]["emoji"]>) =>
        T.string.as(d(() => f.internet.emoji(...args))),
      exampleEmail: (...args: Parameters<Faker["internet"]["exampleEmail"]>) =>
        T.string.as(
          d(() => f.internet.exampleEmail(...args)),
          { format: "email" },
        ),
      httpMethod: (...args: Parameters<Faker["internet"]["httpMethod"]>) =>
        T.enum
          .uniform(["GET", "POST", "PUT", "DELETE", "PATCH"])
          .as(d(() => f.internet.httpMethod(...args))),
      httpStatusCode: (
        ...args: Parameters<Faker["internet"]["httpStatusCode"]>
      ) => T.number.as(d(() => f.internet.httpStatusCode(...args))),
      ip: (...args: Parameters<Faker["internet"]["ip"]>) =>
        T.string.as(d(() => f.internet.ip(...args))),
      ipv4: (...args: Parameters<Faker["internet"]["ipv4"]>) =>
        T.string.as(
          d(() => f.internet.ipv4(...args)),
          { format: "ipv4" },
        ),
      ipv6: (...args: Parameters<Faker["internet"]["ipv6"]>) =>
        T.string.as(
          d(() => f.internet.ipv6(...args)),
          { format: "ipv6" },
        ),
      jwt: (...args: Parameters<Faker["internet"]["jwt"]>) =>
        T.string.as(d(() => f.internet.jwt(...args))),
      jwtAlgorithm: (...args: Parameters<Faker["internet"]["jwtAlgorithm"]>) =>
        T.string.as(d(() => f.internet.jwtAlgorithm(...args))),
      mac: (...args: Parameters<Faker["internet"]["mac"]>) =>
        T.string.as(d(() => f.internet.mac(...args))),
      password: (...args: Parameters<Faker["internet"]["password"]>) =>
        T.string.as(d(() => f.internet.password(...args))),
      port: (...args: Parameters<Faker["internet"]["port"]>) =>
        T.number.as(d(() => f.internet.port(...args))),
      protocol: (...args: Parameters<Faker["internet"]["protocol"]>) =>
        T.enum
          .uniform(["http", "https"])
          .as(d(() => f.internet.protocol(...args))),
      url: (...args: Parameters<Faker["internet"]["url"]>) =>
        T.string.as(
          d(() => f.internet.url(...args)),
          { format: "uri" },
        ),
      userAgent: (...args: Parameters<Faker["internet"]["userAgent"]>) =>
        T.string.as(d(() => f.internet.userAgent(...args))),
      username: (...args: Parameters<Faker["internet"]["username"]>) =>
        T.string.as(d(() => f.internet.username(...args))),
    },
    location: {
      buildingNumber: (
        ...args: Parameters<Faker["location"]["buildingNumber"]>
      ) => T.string.as(d(() => f.location.buildingNumber(...args))),
      cardinalDirection: (
        ...args: Parameters<Faker["location"]["cardinalDirection"]>
      ) => T.string.as(d(() => f.location.cardinalDirection(...args))),
      city: (...args: Parameters<Faker["location"]["city"]>) =>
        T.string.as(d(() => f.location.city(...args))),
      continent: (...args: Parameters<Faker["location"]["continent"]>) =>
        T.string.as(d(() => f.location.continent(...args))),
      country: (...args: Parameters<Faker["location"]["country"]>) =>
        T.string.as(d(() => f.location.country(...args))),
      countryCode: (...args: Parameters<Faker["location"]["countryCode"]>) =>
        T.string.as(d(() => f.location.countryCode(...args))),
      county: (...args: Parameters<Faker["location"]["county"]>) =>
        T.string.as(d(() => f.location.county(...args))),
      direction: (...args: Parameters<Faker["location"]["direction"]>) =>
        T.string.as(d(() => f.location.direction(...args))),
      language: (...args: Parameters<Faker["location"]["language"]>) =>
        T.object({ name: string, alpha2: string, alpha3: string }).as(
          d(() => f.location.language(...args)),
        ),
      latitude: (...args: Parameters<Faker["location"]["latitude"]>) =>
        T.number.as(d(() => f.location.latitude(...args))),
      longitude: (...args: Parameters<Faker["location"]["longitude"]>) =>
        T.number.as(d(() => f.location.longitude(...args))),
      nearbyGPSCoordinate: (
        ...args: Parameters<Faker["location"]["nearbyGPSCoordinate"]>
      ) =>
        T.tuple([T.number, T.number]).as(
          d(() => f.location.nearbyGPSCoordinate(...args)),
        ),
      ordinalDirection: (
        ...args: Parameters<Faker["location"]["ordinalDirection"]>
      ) => T.string.as(d(() => f.location.ordinalDirection(...args))),
      postalAddress: (
        ...args: Parameters<Faker["location"]["postalAddress"]>
      ) => T.string.as(d(() => f.location.postalAddress(...args))),
      secondaryAddress: (
        ...args: Parameters<Faker["location"]["secondaryAddress"]>
      ) => T.string.as(d(() => f.location.secondaryAddress(...args))),
      state: (...args: Parameters<Faker["location"]["state"]>) =>
        T.string.as(d(() => f.location.state(...args))),
      street: (...args: Parameters<Faker["location"]["street"]>) =>
        T.string.as(d(() => f.location.street(...args))),
      streetAddress: (
        ...args: Parameters<Faker["location"]["streetAddress"]>
      ) => T.string.as(d(() => f.location.streetAddress(...args))),
      timeZone: (...args: Parameters<Faker["location"]["timeZone"]>) =>
        T.string.as(d(() => f.location.timeZone(...args))),
      zipCode: (...args: Parameters<Faker["location"]["zipCode"]>) =>
        T.string.as(d(() => f.location.zipCode(...args))),
    },
    lorem: {
      lines: (...args: Parameters<Faker["lorem"]["lines"]>) =>
        T.string.as(d(() => f.lorem.lines(...args))),
      paragraph: (...args: Parameters<Faker["lorem"]["paragraph"]>) =>
        T.string.as(d(() => f.lorem.paragraph(...args))),
      paragraphs: (...args: Parameters<Faker["lorem"]["paragraphs"]>) =>
        T.string.as(d(() => f.lorem.paragraphs(...args))),
      sentence: (...args: Parameters<Faker["lorem"]["sentence"]>) =>
        T.string.as(d(() => f.lorem.sentence(...args))),
      sentences: (...args: Parameters<Faker["lorem"]["sentences"]>) =>
        T.string.as(d(() => f.lorem.sentences(...args))),
      slug: (...args: Parameters<Faker["lorem"]["slug"]>) =>
        T.string.as(d(() => f.lorem.slug(...args))),
      text: (...args: Parameters<Faker["lorem"]["text"]>) =>
        T.string.as(d(() => f.lorem.text(...args))),
      word: (...args: Parameters<Faker["lorem"]["word"]>) =>
        T.string.as(d(() => f.lorem.word(...args))),
      words: (...args: Parameters<Faker["lorem"]["words"]>) =>
        T.string.as(d(() => f.lorem.words(...args))),
    },
    music: {
      album: (...args: Parameters<Faker["music"]["album"]>) =>
        T.string.as(d(() => f.music.album(...args))),
      artist: (...args: Parameters<Faker["music"]["artist"]>) =>
        T.string.as(d(() => f.music.artist(...args))),
      genre: (...args: Parameters<Faker["music"]["genre"]>) =>
        T.string.as(d(() => f.music.genre(...args))),
      songName: (...args: Parameters<Faker["music"]["songName"]>) =>
        T.string.as(d(() => f.music.songName(...args))),
    },
    number: {
      bigInt: (...args: Parameters<Faker["number"]["bigInt"]>) =>
        T.bigint.as(d(() => f.number.bigInt(...args))),
      binary: (...args: Parameters<Faker["number"]["binary"]>) =>
        T.string.as(d(() => f.number.binary(...args))),
      float: (...args: Parameters<Faker["number"]["float"]>) =>
        T.number.as(d(() => f.number.float(...args))),
      hex: (...args: Parameters<Faker["number"]["hex"]>) =>
        T.string.as(d(() => f.number.hex(...args))),
      int: (...args: Parameters<Faker["number"]["int"]>) =>
        T.number.as(d(() => f.number.int(...args))),
      octal: (...args: Parameters<Faker["number"]["octal"]>) =>
        T.string.as(d(() => f.number.octal(...args))),
      romanNumeral: (...args: Parameters<Faker["number"]["romanNumeral"]>) =>
        T.string.as(d(() => f.number.romanNumeral(...args))),
    },
    person: {
      bio: (...args: Parameters<Faker["person"]["bio"]>) =>
        T.string.as(d(() => f.person.bio(...args))),
      firstName: (...args: Parameters<Faker["person"]["firstName"]>) =>
        T.string.as(d(() => f.person.firstName(...args))),
      fullName: (...args: Parameters<Faker["person"]["fullName"]>) =>
        T.string.as(d(() => f.person.fullName(...args))),
      gender: (...args: Parameters<Faker["person"]["gender"]>) =>
        T.string.as(d(() => f.person.gender(...args))),
      jobArea: (...args: Parameters<Faker["person"]["jobArea"]>) =>
        T.string.as(d(() => f.person.jobArea(...args))),
      jobDescriptor: (...args: Parameters<Faker["person"]["jobDescriptor"]>) =>
        T.string.as(d(() => f.person.jobDescriptor(...args))),
      jobTitle: (...args: Parameters<Faker["person"]["jobTitle"]>) =>
        T.string.as(d(() => f.person.jobTitle(...args))),
      jobType: (...args: Parameters<Faker["person"]["jobType"]>) =>
        T.string.as(d(() => f.person.jobType(...args))),
      lastName: (...args: Parameters<Faker["person"]["lastName"]>) =>
        T.string.as(d(() => f.person.lastName(...args))),
      middleName: (...args: Parameters<Faker["person"]["middleName"]>) =>
        T.string.as(d(() => f.person.middleName(...args))),
      prefix: (...args: Parameters<Faker["person"]["prefix"]>) =>
        T.string.as(d(() => f.person.prefix(...args))),
      sex: (...args: Parameters<Faker["person"]["sex"]>) =>
        T.string.as(d(() => f.person.sex(...args))),
      sexType: (...args: Parameters<Faker["person"]["sexType"]>) =>
        T.enum
          .uniform(["female", "generic", "male"])
          .as(d(() => f.person.sexType(...args))),
      suffix: (...args: Parameters<Faker["person"]["suffix"]>) =>
        T.string.as(d(() => f.person.suffix(...args))),
      zodiacSign: (...args: Parameters<Faker["person"]["zodiacSign"]>) =>
        T.string.as(d(() => f.person.zodiacSign(...args))),
    },
    phone: {
      imei: (...args: Parameters<Faker["phone"]["imei"]>) =>
        T.string.as(d(() => f.phone.imei(...args))),
      number: (...args: Parameters<Faker["phone"]["number"]>) =>
        T.string.as(d(() => f.phone.number(...args))),
    },
    science: {
      chemicalElement: (
        ...args: Parameters<Faker["science"]["chemicalElement"]>
      ) =>
        T.object({ symbol: string, name: string, atomicNumber: T.number }).as(
          d(() => f.science.chemicalElement(...args)),
        ),
      unit: (...args: Parameters<Faker["science"]["unit"]>) =>
        T.object({ name: string, symbol: string }).as(
          d(() => f.science.unit(...args)),
        ),
    },
    string: {
      alpha: (...args: Parameters<Faker["string"]["alpha"]>) =>
        T.string.as(d(() => f.string.alpha(...args))),
      alphanumeric: (...args: Parameters<Faker["string"]["alphanumeric"]>) =>
        T.string.as(d(() => f.string.alphanumeric(...args))),
      binary: (...args: Parameters<Faker["string"]["binary"]>) =>
        T.string.as(d(() => f.string.binary(...args))),
      fromCharacters: (
        ...args: Parameters<Faker["string"]["fromCharacters"]>
      ) => T.string.as(d(() => f.string.fromCharacters(...args))),
      hexadecimal: (...args: Parameters<Faker["string"]["hexadecimal"]>) =>
        T.string.as(d(() => f.string.hexadecimal(...args))),
      nanoid: (...args: Parameters<Faker["string"]["nanoid"]>) =>
        T.string.as(d(() => f.string.nanoid(...args))),
      numeric: (...args: Parameters<Faker["string"]["numeric"]>) =>
        T.string.as(d(() => f.string.numeric(...args))),
      octal: (...args: Parameters<Faker["string"]["octal"]>) =>
        T.string.as(d(() => f.string.octal(...args))),
      sample: (...args: Parameters<Faker["string"]["sample"]>) =>
        T.string.as(d(() => f.string.sample(...args))),
      symbol: (...args: Parameters<Faker["string"]["symbol"]>) =>
        T.string.as(d(() => f.string.symbol(...args))),
      ulid: (...args: Parameters<Faker["string"]["ulid"]>) =>
        T.string.as(d(() => f.string.ulid(...args))),
      uuid: (...args: Parameters<Faker["string"]["uuid"]>) =>
        T.string.as(
          d(() => f.string.uuid(...args)),
          { format: "uuid" },
        ),
    },
    system: {
      commonFileExt: (...args: Parameters<Faker["system"]["commonFileExt"]>) =>
        T.string.as(d(() => f.system.commonFileExt(...args))),
      commonFileName: (
        ...args: Parameters<Faker["system"]["commonFileName"]>
      ) => T.string.as(d(() => f.system.commonFileName(...args))),
      commonFileType: (
        ...args: Parameters<Faker["system"]["commonFileType"]>
      ) => T.string.as(d(() => f.system.commonFileType(...args))),
      cron: (...args: Parameters<Faker["system"]["cron"]>) =>
        T.string.as(d(() => f.system.cron(...args))),
      directoryPath: (...args: Parameters<Faker["system"]["directoryPath"]>) =>
        T.string.as(d(() => f.system.directoryPath(...args))),
      fileExt: (...args: Parameters<Faker["system"]["fileExt"]>) =>
        T.string.as(d(() => f.system.fileExt(...args))),
      fileName: (...args: Parameters<Faker["system"]["fileName"]>) =>
        T.string.as(d(() => f.system.fileName(...args))),
      filePath: (...args: Parameters<Faker["system"]["filePath"]>) =>
        T.string.as(
          d(() => f.system.filePath(...args)),
          { format: "uri-reference" },
        ),
      fileType: (...args: Parameters<Faker["system"]["fileType"]>) =>
        T.string.as(d(() => f.system.fileType(...args))),
      mimeType: (...args: Parameters<Faker["system"]["mimeType"]>) =>
        T.string.as(d(() => f.system.mimeType(...args))),
      networkInterface: (
        ...args: Parameters<Faker["system"]["networkInterface"]>
      ) => T.string.as(d(() => f.system.networkInterface(...args))),
      semver: (...args: Parameters<Faker["system"]["semver"]>) =>
        T.string.as(d(() => f.system.semver(...args))),
    },
    vehicle: {
      bicycle: (...args: Parameters<Faker["vehicle"]["bicycle"]>) =>
        T.string.as(d(() => f.vehicle.bicycle(...args))),
      color: (...args: Parameters<Faker["vehicle"]["color"]>) =>
        T.string.as(d(() => f.vehicle.color(...args))),
      fuel: (...args: Parameters<Faker["vehicle"]["fuel"]>) =>
        T.string.as(d(() => f.vehicle.fuel(...args))),
      manufacturer: (...args: Parameters<Faker["vehicle"]["manufacturer"]>) =>
        T.string.as(d(() => f.vehicle.manufacturer(...args))),
      model: (...args: Parameters<Faker["vehicle"]["model"]>) =>
        T.string.as(d(() => f.vehicle.model(...args))),
      type: (...args: Parameters<Faker["vehicle"]["type"]>) =>
        T.string.as(d(() => f.vehicle.type(...args))),
      vehicle: (...args: Parameters<Faker["vehicle"]["vehicle"]>) =>
        T.string.as(d(() => f.vehicle.vehicle(...args))),
      vin: (...args: Parameters<Faker["vehicle"]["vin"]>) =>
        T.string.as(d(() => f.vehicle.vin(...args))),
      vrm: (...args: Parameters<Faker["vehicle"]["vrm"]>) =>
        T.string.as(d(() => f.vehicle.vrm(...args))),
    },
    word: {
      adjective: (...args: Parameters<Faker["word"]["adjective"]>) =>
        T.string.as(d(() => f.word.adjective(...args))),
      adverb: (...args: Parameters<Faker["word"]["adverb"]>) =>
        T.string.as(d(() => f.word.adverb(...args))),
      conjunction: (...args: Parameters<Faker["word"]["conjunction"]>) =>
        T.string.as(d(() => f.word.conjunction(...args))),
      interjection: (...args: Parameters<Faker["word"]["interjection"]>) =>
        T.string.as(d(() => f.word.interjection(...args))),
      noun: (...args: Parameters<Faker["word"]["noun"]>) =>
        T.string.as(d(() => f.word.noun(...args))),
      preposition: (...args: Parameters<Faker["word"]["preposition"]>) =>
        T.string.as(d(() => f.word.preposition(...args))),
      sample: (...args: Parameters<Faker["word"]["sample"]>) =>
        T.string.as(d(() => f.word.sample(...args))),
      verb: (...args: Parameters<Faker["word"]["verb"]>) =>
        T.string.as(d(() => f.word.verb(...args))),
      words: (...args: Parameters<Faker["word"]["words"]>) =>
        T.string.as(d(() => f.word.words(...args))),
    },
  };
}
