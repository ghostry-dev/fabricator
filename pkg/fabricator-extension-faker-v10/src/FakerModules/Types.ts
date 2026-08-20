/**
 * The `faker` namespace's public type surface: one concrete property
 * declaration per builder, hand-maintained alongside `./Build.ts`.
 *
 * **This file and `./Build.ts` are two halves of one thing.** This one declares
 * the contract; that one implements it, under a `FakerModules` return
 * annotation that makes any disagreement a compile error. Neither is derived
 * from the other, and neither may be edited alone.
 *
 * Written out property by property, not mapped over a table. A mapped type must
 * instantiate every member to resolve any one of them, so having the derived
 * form in the program exhausted TypeScript 5's 5,000,000-instantiation budget
 * and made every `toTypeBox(...)` call fail with TS2589. Each property here is
 * a plain declaration TypeScript reads rather than computes. This repo's
 * `check` runs TypeScript 7, whose budget is larger — `bun run check` passing
 * is _not_ evidence a derived form would be affordable for consumers;
 * `check:ts5` is.
 *
 * A `type` alias, never an `interface`: only an object-literal type gets an
 * implicit index signature, and without one `DeepMerge`'s `$AV extends
 * PlainObject` test fails, silently degrading `registry.extend` from merging
 * into a node to replacing it wholesale. `test/Mergeable.test.ts` is the
 * guard.
 *
 * Each method keeps faker's argument surface by spreading its whole
 * `Parameters<...>` tuple, so arity and requiredness are faker's own —
 * `date.between`'s required options stay required, and
 * `string.fromCharacters`'s second parameter stays reachable. A single
 * `options?` is wrong in both directions: it invites omitting an argument faker
 * throws without, and it hides every parameter past the first.
 *
 * ## Bumping `@faker-js/faker`
 *
 * No generator; `bun run check` is the worklist. Each drift surface has its own
 * assertion in `test/index.types.test.ts`:
 *
 * 1. A module added or removed fails `_ModulesExhaustive`.
 * 2. A method added or removed fails `MethodsExhaustive<$M>` for that module.
 * 3. A changed return type fails `ModuleHonest<$M>` at the exact entry — narrow
 *    with `T.enum.uniform([...])` where faker's declared return is a literal
 *    union rather than a bare `string`.
 * 4. A reordered overload set changes `Parameters<...>` here, which the matching
 *    builder's `...args` forwarding then fails to accept.
 *
 * Fix the entry in **both** files; the annotation on `build` fails until they
 * agree.
 *
 * These assertions resolve through built `dist/`, not `src/` (`CLAUDE.md`'s
 * test-import convention), so a `src`-only edit proves nothing about faker
 * drift until you rebuild. A disagreement between this file and `./Build.ts` is
 * caught without one, being internal to `src`.
 */
import type { Faker } from "@faker-js/faker";
import type { Primitive } from "@ghostry/fabricator/internal";

export type FakerModules = {
  readonly airline: {
    readonly aircraftType: (
      ...args: Parameters<Faker["airline"]["aircraftType"]>
    ) => Primitive.enum.Schema<
      readonly [
        readonly [number, "narrowbody"],
        readonly [number, "regional"],
        readonly [number, "widebody"],
      ]
    >;
    readonly airline: (
      ...args: Parameters<Faker["airline"]["airline"]>
    ) => Primitive.object.Schema<{
      readonly name: Primitive.string.Schema;
      readonly iataCode: Primitive.string.Schema;
    }>;
    readonly airplane: (
      ...args: Parameters<Faker["airline"]["airplane"]>
    ) => Primitive.object.Schema<{
      readonly name: Primitive.string.Schema;
      readonly iataTypeCode: Primitive.string.Schema;
    }>;
    readonly airport: (
      ...args: Parameters<Faker["airline"]["airport"]>
    ) => Primitive.object.Schema<{
      readonly name: Primitive.string.Schema;
      readonly iataCode: Primitive.string.Schema;
    }>;
    readonly flightNumber: (
      ...args: Parameters<Faker["airline"]["flightNumber"]>
    ) => Primitive.string.Schema;
    readonly recordLocator: (
      ...args: Parameters<Faker["airline"]["recordLocator"]>
    ) => Primitive.string.Schema;
    readonly seat: (
      ...args: Parameters<Faker["airline"]["seat"]>
    ) => Primitive.string.Schema;
  };
  readonly animal: {
    readonly bear: (
      ...args: Parameters<Faker["animal"]["bear"]>
    ) => Primitive.string.Schema;
    readonly bird: (
      ...args: Parameters<Faker["animal"]["bird"]>
    ) => Primitive.string.Schema;
    readonly cat: (
      ...args: Parameters<Faker["animal"]["cat"]>
    ) => Primitive.string.Schema;
    readonly cetacean: (
      ...args: Parameters<Faker["animal"]["cetacean"]>
    ) => Primitive.string.Schema;
    readonly cow: (
      ...args: Parameters<Faker["animal"]["cow"]>
    ) => Primitive.string.Schema;
    readonly crocodilia: (
      ...args: Parameters<Faker["animal"]["crocodilia"]>
    ) => Primitive.string.Schema;
    readonly dog: (
      ...args: Parameters<Faker["animal"]["dog"]>
    ) => Primitive.string.Schema;
    readonly fish: (
      ...args: Parameters<Faker["animal"]["fish"]>
    ) => Primitive.string.Schema;
    readonly horse: (
      ...args: Parameters<Faker["animal"]["horse"]>
    ) => Primitive.string.Schema;
    readonly insect: (
      ...args: Parameters<Faker["animal"]["insect"]>
    ) => Primitive.string.Schema;
    readonly lion: (
      ...args: Parameters<Faker["animal"]["lion"]>
    ) => Primitive.string.Schema;
    readonly petName: (
      ...args: Parameters<Faker["animal"]["petName"]>
    ) => Primitive.string.Schema;
    readonly rabbit: (
      ...args: Parameters<Faker["animal"]["rabbit"]>
    ) => Primitive.string.Schema;
    readonly rodent: (
      ...args: Parameters<Faker["animal"]["rodent"]>
    ) => Primitive.string.Schema;
    readonly snake: (
      ...args: Parameters<Faker["animal"]["snake"]>
    ) => Primitive.string.Schema;
    readonly type: (
      ...args: Parameters<Faker["animal"]["type"]>
    ) => Primitive.string.Schema;
  };
  readonly book: {
    readonly author: (
      ...args: Parameters<Faker["book"]["author"]>
    ) => Primitive.string.Schema;
    readonly format: (
      ...args: Parameters<Faker["book"]["format"]>
    ) => Primitive.string.Schema;
    readonly genre: (
      ...args: Parameters<Faker["book"]["genre"]>
    ) => Primitive.string.Schema;
    readonly publisher: (
      ...args: Parameters<Faker["book"]["publisher"]>
    ) => Primitive.string.Schema;
    readonly series: (
      ...args: Parameters<Faker["book"]["series"]>
    ) => Primitive.string.Schema;
    readonly title: (
      ...args: Parameters<Faker["book"]["title"]>
    ) => Primitive.string.Schema;
  };
  readonly color: {
    readonly cssSupportedFunction: (
      ...args: Parameters<Faker["color"]["cssSupportedFunction"]>
    ) => Primitive.enum.Schema<
      readonly [
        readonly [number, "rgb"],
        readonly [number, "rgba"],
        readonly [number, "hsl"],
        readonly [number, "hsla"],
        readonly [number, "hwb"],
        readonly [number, "cmyk"],
        readonly [number, "lab"],
        readonly [number, "lch"],
        readonly [number, "color"],
      ]
    >;
    readonly cssSupportedSpace: (
      ...args: Parameters<Faker["color"]["cssSupportedSpace"]>
    ) => Primitive.enum.Schema<
      readonly [
        readonly [number, "sRGB"],
        readonly [number, "display-p3"],
        readonly [number, "rec2020"],
        readonly [number, "a98-rgb"],
        readonly [number, "prophoto-rgb"],
      ]
    >;
    readonly human: (
      ...args: Parameters<Faker["color"]["human"]>
    ) => Primitive.string.Schema;
    readonly space: (
      ...args: Parameters<Faker["color"]["space"]>
    ) => Primitive.string.Schema;
    readonly rgb: {
      readonly text: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["rgb"]>[0]>,
          "format"
        >,
      ) => Primitive.string.Schema;
      readonly channels: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["rgb"]>[0]>,
          "format"
        >,
      ) => Primitive.array.Schema<Primitive.number.Schema>;
    };
    readonly cmyk: {
      readonly text: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["cmyk"]>[0]>,
          "format"
        >,
      ) => Primitive.string.Schema;
      readonly channels: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["cmyk"]>[0]>,
          "format"
        >,
      ) => Primitive.array.Schema<Primitive.number.Schema>;
    };
    readonly hsl: {
      readonly text: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["hsl"]>[0]>,
          "format"
        >,
      ) => Primitive.string.Schema;
      readonly channels: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["hsl"]>[0]>,
          "format"
        >,
      ) => Primitive.array.Schema<Primitive.number.Schema>;
    };
    readonly hwb: {
      readonly text: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["hwb"]>[0]>,
          "format"
        >,
      ) => Primitive.string.Schema;
      readonly channels: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["hwb"]>[0]>,
          "format"
        >,
      ) => Primitive.array.Schema<Primitive.number.Schema>;
    };
    readonly lab: {
      readonly text: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["lab"]>[0]>,
          "format"
        >,
      ) => Primitive.string.Schema;
      readonly channels: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["lab"]>[0]>,
          "format"
        >,
      ) => Primitive.array.Schema<Primitive.number.Schema>;
    };
    readonly lch: {
      readonly text: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["lch"]>[0]>,
          "format"
        >,
      ) => Primitive.string.Schema;
      readonly channels: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["lch"]>[0]>,
          "format"
        >,
      ) => Primitive.array.Schema<Primitive.number.Schema>;
    };
    readonly colorByCSSColorSpace: {
      readonly text: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["colorByCSSColorSpace"]>[0]>,
          "format"
        >,
      ) => Primitive.string.Schema;
      readonly channels: (
        options?: Omit<
          NonNullable<Parameters<Faker["color"]["colorByCSSColorSpace"]>[0]>,
          "format"
        >,
      ) => Primitive.array.Schema<Primitive.number.Schema>;
    };
  };
  readonly commerce: {
    readonly department: (
      ...args: Parameters<Faker["commerce"]["department"]>
    ) => Primitive.string.Schema;
    readonly isbn: (
      ...args: Parameters<Faker["commerce"]["isbn"]>
    ) => Primitive.string.Schema;
    readonly price: (
      ...args: Parameters<Faker["commerce"]["price"]>
    ) => Primitive.string.Schema;
    readonly product: (
      ...args: Parameters<Faker["commerce"]["product"]>
    ) => Primitive.string.Schema;
    readonly productAdjective: (
      ...args: Parameters<Faker["commerce"]["productAdjective"]>
    ) => Primitive.string.Schema;
    readonly productDescription: (
      ...args: Parameters<Faker["commerce"]["productDescription"]>
    ) => Primitive.string.Schema;
    readonly productMaterial: (
      ...args: Parameters<Faker["commerce"]["productMaterial"]>
    ) => Primitive.string.Schema;
    readonly productName: (
      ...args: Parameters<Faker["commerce"]["productName"]>
    ) => Primitive.string.Schema;
    readonly upc: (
      ...args: Parameters<Faker["commerce"]["upc"]>
    ) => Primitive.string.Schema;
  };
  readonly company: {
    readonly buzzAdjective: (
      ...args: Parameters<Faker["company"]["buzzAdjective"]>
    ) => Primitive.string.Schema;
    readonly buzzNoun: (
      ...args: Parameters<Faker["company"]["buzzNoun"]>
    ) => Primitive.string.Schema;
    readonly buzzPhrase: (
      ...args: Parameters<Faker["company"]["buzzPhrase"]>
    ) => Primitive.string.Schema;
    readonly buzzVerb: (
      ...args: Parameters<Faker["company"]["buzzVerb"]>
    ) => Primitive.string.Schema;
    readonly catchPhrase: (
      ...args: Parameters<Faker["company"]["catchPhrase"]>
    ) => Primitive.string.Schema;
    readonly catchPhraseAdjective: (
      ...args: Parameters<Faker["company"]["catchPhraseAdjective"]>
    ) => Primitive.string.Schema;
    readonly catchPhraseDescriptor: (
      ...args: Parameters<Faker["company"]["catchPhraseDescriptor"]>
    ) => Primitive.string.Schema;
    readonly catchPhraseNoun: (
      ...args: Parameters<Faker["company"]["catchPhraseNoun"]>
    ) => Primitive.string.Schema;
    readonly name: (
      ...args: Parameters<Faker["company"]["name"]>
    ) => Primitive.string.Schema;
  };
  readonly database: {
    readonly collation: (
      ...args: Parameters<Faker["database"]["collation"]>
    ) => Primitive.string.Schema;
    readonly column: (
      ...args: Parameters<Faker["database"]["column"]>
    ) => Primitive.string.Schema;
    readonly engine: (
      ...args: Parameters<Faker["database"]["engine"]>
    ) => Primitive.string.Schema;
    readonly mongodbObjectId: (
      ...args: Parameters<Faker["database"]["mongodbObjectId"]>
    ) => Primitive.string.Schema;
    readonly type: (
      ...args: Parameters<Faker["database"]["type"]>
    ) => Primitive.string.Schema;
  };
  readonly datatype: {
    readonly boolean: (
      ...args: Parameters<Faker["datatype"]["boolean"]>
    ) => Primitive.boolean.Schema;
  };
  readonly date: {
    readonly anytime: (
      ...args: Parameters<Faker["date"]["anytime"]>
    ) => Primitive.date.Schema;
    readonly between: (
      ...args: Parameters<Faker["date"]["between"]>
    ) => Primitive.date.Schema;
    readonly betweens: (
      ...args: Parameters<Faker["date"]["betweens"]>
    ) => Primitive.array.Schema<Primitive.date.Schema>;
    readonly birthdate: (
      ...args: Parameters<Faker["date"]["birthdate"]>
    ) => Primitive.date.Schema;
    readonly future: (
      ...args: Parameters<Faker["date"]["future"]>
    ) => Primitive.date.Schema;
    readonly month: (
      ...args: Parameters<Faker["date"]["month"]>
    ) => Primitive.string.Schema;
    readonly past: (
      ...args: Parameters<Faker["date"]["past"]>
    ) => Primitive.date.Schema;
    readonly recent: (
      ...args: Parameters<Faker["date"]["recent"]>
    ) => Primitive.date.Schema;
    readonly soon: (
      ...args: Parameters<Faker["date"]["soon"]>
    ) => Primitive.date.Schema;
    readonly timeZone: (
      ...args: Parameters<Faker["date"]["timeZone"]>
    ) => Primitive.string.Schema;
    readonly weekday: (
      ...args: Parameters<Faker["date"]["weekday"]>
    ) => Primitive.string.Schema;
  };
  readonly finance: {
    readonly accountName: (
      ...args: Parameters<Faker["finance"]["accountName"]>
    ) => Primitive.string.Schema;
    readonly accountNumber: (
      ...args: Parameters<Faker["finance"]["accountNumber"]>
    ) => Primitive.string.Schema;
    readonly amount: (
      ...args: Parameters<Faker["finance"]["amount"]>
    ) => Primitive.string.Schema;
    readonly bic: (
      ...args: Parameters<Faker["finance"]["bic"]>
    ) => Primitive.string.Schema;
    readonly bitcoinAddress: (
      ...args: Parameters<Faker["finance"]["bitcoinAddress"]>
    ) => Primitive.string.Schema;
    readonly creditCardCVV: (
      ...args: Parameters<Faker["finance"]["creditCardCVV"]>
    ) => Primitive.string.Schema;
    readonly creditCardIssuer: (
      ...args: Parameters<Faker["finance"]["creditCardIssuer"]>
    ) => Primitive.string.Schema;
    readonly creditCardNumber: (
      ...args: Parameters<Faker["finance"]["creditCardNumber"]>
    ) => Primitive.string.Schema;
    readonly currency: (
      ...args: Parameters<Faker["finance"]["currency"]>
    ) => Primitive.object.Schema<{
      readonly name: Primitive.string.Schema;
      readonly code: Primitive.string.Schema;
      readonly symbol: Primitive.string.Schema;
      readonly numericCode: Primitive.string.Schema;
    }>;
    readonly currencyCode: (
      ...args: Parameters<Faker["finance"]["currencyCode"]>
    ) => Primitive.string.Schema;
    readonly currencyName: (
      ...args: Parameters<Faker["finance"]["currencyName"]>
    ) => Primitive.string.Schema;
    readonly currencyNumericCode: (
      ...args: Parameters<Faker["finance"]["currencyNumericCode"]>
    ) => Primitive.string.Schema;
    readonly currencySymbol: (
      ...args: Parameters<Faker["finance"]["currencySymbol"]>
    ) => Primitive.string.Schema;
    readonly ethereumAddress: (
      ...args: Parameters<Faker["finance"]["ethereumAddress"]>
    ) => Primitive.string.Schema;
    readonly iban: (
      ...args: Parameters<Faker["finance"]["iban"]>
    ) => Primitive.string.Schema;
    readonly litecoinAddress: (
      ...args: Parameters<Faker["finance"]["litecoinAddress"]>
    ) => Primitive.string.Schema;
    readonly pin: (
      ...args: Parameters<Faker["finance"]["pin"]>
    ) => Primitive.string.Schema;
    readonly routingNumber: (
      ...args: Parameters<Faker["finance"]["routingNumber"]>
    ) => Primitive.string.Schema;
    readonly transactionDescription: (
      ...args: Parameters<Faker["finance"]["transactionDescription"]>
    ) => Primitive.string.Schema;
    readonly transactionType: (
      ...args: Parameters<Faker["finance"]["transactionType"]>
    ) => Primitive.string.Schema;
  };
  readonly food: {
    readonly adjective: (
      ...args: Parameters<Faker["food"]["adjective"]>
    ) => Primitive.string.Schema;
    readonly description: (
      ...args: Parameters<Faker["food"]["description"]>
    ) => Primitive.string.Schema;
    readonly dish: (
      ...args: Parameters<Faker["food"]["dish"]>
    ) => Primitive.string.Schema;
    readonly ethnicCategory: (
      ...args: Parameters<Faker["food"]["ethnicCategory"]>
    ) => Primitive.string.Schema;
    readonly fruit: (
      ...args: Parameters<Faker["food"]["fruit"]>
    ) => Primitive.string.Schema;
    readonly ingredient: (
      ...args: Parameters<Faker["food"]["ingredient"]>
    ) => Primitive.string.Schema;
    readonly meat: (
      ...args: Parameters<Faker["food"]["meat"]>
    ) => Primitive.string.Schema;
    readonly spice: (
      ...args: Parameters<Faker["food"]["spice"]>
    ) => Primitive.string.Schema;
    readonly vegetable: (
      ...args: Parameters<Faker["food"]["vegetable"]>
    ) => Primitive.string.Schema;
  };
  readonly git: {
    readonly branch: (
      ...args: Parameters<Faker["git"]["branch"]>
    ) => Primitive.string.Schema;
    readonly commitDate: (
      ...args: Parameters<Faker["git"]["commitDate"]>
    ) => Primitive.string.Schema;
    readonly commitEntry: (
      ...args: Parameters<Faker["git"]["commitEntry"]>
    ) => Primitive.string.Schema;
    readonly commitMessage: (
      ...args: Parameters<Faker["git"]["commitMessage"]>
    ) => Primitive.string.Schema;
    readonly commitSha: (
      ...args: Parameters<Faker["git"]["commitSha"]>
    ) => Primitive.string.Schema;
  };
  readonly hacker: {
    readonly abbreviation: (
      ...args: Parameters<Faker["hacker"]["abbreviation"]>
    ) => Primitive.string.Schema;
    readonly adjective: (
      ...args: Parameters<Faker["hacker"]["adjective"]>
    ) => Primitive.string.Schema;
    readonly ingverb: (
      ...args: Parameters<Faker["hacker"]["ingverb"]>
    ) => Primitive.string.Schema;
    readonly noun: (
      ...args: Parameters<Faker["hacker"]["noun"]>
    ) => Primitive.string.Schema;
    readonly phrase: (
      ...args: Parameters<Faker["hacker"]["phrase"]>
    ) => Primitive.string.Schema;
    readonly verb: (
      ...args: Parameters<Faker["hacker"]["verb"]>
    ) => Primitive.string.Schema;
  };
  readonly image: {
    readonly avatar: (
      ...args: Parameters<Faker["image"]["avatar"]>
    ) => Primitive.string.Schema;
    readonly avatarGitHub: (
      ...args: Parameters<Faker["image"]["avatarGitHub"]>
    ) => Primitive.string.Schema;
    readonly dataUri: (
      ...args: Parameters<Faker["image"]["dataUri"]>
    ) => Primitive.string.Schema;
    readonly personPortrait: (
      ...args: Parameters<Faker["image"]["personPortrait"]>
    ) => Primitive.string.Schema;
    readonly url: (
      ...args: Parameters<Faker["image"]["url"]>
    ) => Primitive.string.Schema;
    readonly urlLoremFlickr: (
      ...args: Parameters<Faker["image"]["urlLoremFlickr"]>
    ) => Primitive.string.Schema;
    readonly urlPicsumPhotos: (
      ...args: Parameters<Faker["image"]["urlPicsumPhotos"]>
    ) => Primitive.string.Schema;
  };
  readonly internet: {
    readonly displayName: (
      ...args: Parameters<Faker["internet"]["displayName"]>
    ) => Primitive.string.Schema;
    readonly domainName: (
      ...args: Parameters<Faker["internet"]["domainName"]>
    ) => Primitive.string.Schema;
    readonly domainSuffix: (
      ...args: Parameters<Faker["internet"]["domainSuffix"]>
    ) => Primitive.string.Schema;
    readonly domainWord: (
      ...args: Parameters<Faker["internet"]["domainWord"]>
    ) => Primitive.string.Schema;
    readonly email: (
      ...args: Parameters<Faker["internet"]["email"]>
    ) => Primitive.string.Schema;
    readonly emoji: (
      ...args: Parameters<Faker["internet"]["emoji"]>
    ) => Primitive.string.Schema;
    readonly exampleEmail: (
      ...args: Parameters<Faker["internet"]["exampleEmail"]>
    ) => Primitive.string.Schema;
    readonly httpMethod: (
      ...args: Parameters<Faker["internet"]["httpMethod"]>
    ) => Primitive.enum.Schema<
      readonly [
        readonly [number, "GET"],
        readonly [number, "POST"],
        readonly [number, "PUT"],
        readonly [number, "DELETE"],
        readonly [number, "PATCH"],
      ]
    >;
    readonly httpStatusCode: (
      ...args: Parameters<Faker["internet"]["httpStatusCode"]>
    ) => Primitive.number.Schema;
    readonly ip: (
      ...args: Parameters<Faker["internet"]["ip"]>
    ) => Primitive.string.Schema;
    readonly ipv4: (
      ...args: Parameters<Faker["internet"]["ipv4"]>
    ) => Primitive.string.Schema;
    readonly ipv6: (
      ...args: Parameters<Faker["internet"]["ipv6"]>
    ) => Primitive.string.Schema;
    readonly jwt: (
      ...args: Parameters<Faker["internet"]["jwt"]>
    ) => Primitive.string.Schema;
    readonly jwtAlgorithm: (
      ...args: Parameters<Faker["internet"]["jwtAlgorithm"]>
    ) => Primitive.string.Schema;
    readonly mac: (
      ...args: Parameters<Faker["internet"]["mac"]>
    ) => Primitive.string.Schema;
    readonly password: (
      ...args: Parameters<Faker["internet"]["password"]>
    ) => Primitive.string.Schema;
    readonly port: (
      ...args: Parameters<Faker["internet"]["port"]>
    ) => Primitive.number.Schema;
    readonly protocol: (
      ...args: Parameters<Faker["internet"]["protocol"]>
    ) => Primitive.enum.Schema<
      readonly [readonly [number, "http"], readonly [number, "https"]]
    >;
    readonly url: (
      ...args: Parameters<Faker["internet"]["url"]>
    ) => Primitive.string.Schema;
    readonly userAgent: (
      ...args: Parameters<Faker["internet"]["userAgent"]>
    ) => Primitive.string.Schema;
    readonly username: (
      ...args: Parameters<Faker["internet"]["username"]>
    ) => Primitive.string.Schema;
  };
  readonly location: {
    readonly buildingNumber: (
      ...args: Parameters<Faker["location"]["buildingNumber"]>
    ) => Primitive.string.Schema;
    readonly cardinalDirection: (
      ...args: Parameters<Faker["location"]["cardinalDirection"]>
    ) => Primitive.string.Schema;
    readonly city: (
      ...args: Parameters<Faker["location"]["city"]>
    ) => Primitive.string.Schema;
    readonly continent: (
      ...args: Parameters<Faker["location"]["continent"]>
    ) => Primitive.string.Schema;
    readonly country: (
      ...args: Parameters<Faker["location"]["country"]>
    ) => Primitive.string.Schema;
    readonly countryCode: (
      ...args: Parameters<Faker["location"]["countryCode"]>
    ) => Primitive.string.Schema;
    readonly county: (
      ...args: Parameters<Faker["location"]["county"]>
    ) => Primitive.string.Schema;
    readonly direction: (
      ...args: Parameters<Faker["location"]["direction"]>
    ) => Primitive.string.Schema;
    readonly language: (
      ...args: Parameters<Faker["location"]["language"]>
    ) => Primitive.object.Schema<{
      readonly name: Primitive.string.Schema;
      readonly alpha2: Primitive.string.Schema;
      readonly alpha3: Primitive.string.Schema;
    }>;
    readonly latitude: (
      ...args: Parameters<Faker["location"]["latitude"]>
    ) => Primitive.number.Schema;
    readonly longitude: (
      ...args: Parameters<Faker["location"]["longitude"]>
    ) => Primitive.number.Schema;
    readonly nearbyGPSCoordinate: (
      ...args: Parameters<Faker["location"]["nearbyGPSCoordinate"]>
    ) => Primitive.tuple.Schema<
      readonly [Primitive.number.Schema, Primitive.number.Schema]
    >;
    readonly ordinalDirection: (
      ...args: Parameters<Faker["location"]["ordinalDirection"]>
    ) => Primitive.string.Schema;
    readonly postalAddress: (
      ...args: Parameters<Faker["location"]["postalAddress"]>
    ) => Primitive.string.Schema;
    readonly secondaryAddress: (
      ...args: Parameters<Faker["location"]["secondaryAddress"]>
    ) => Primitive.string.Schema;
    readonly state: (
      ...args: Parameters<Faker["location"]["state"]>
    ) => Primitive.string.Schema;
    readonly street: (
      ...args: Parameters<Faker["location"]["street"]>
    ) => Primitive.string.Schema;
    readonly streetAddress: (
      ...args: Parameters<Faker["location"]["streetAddress"]>
    ) => Primitive.string.Schema;
    readonly timeZone: (
      ...args: Parameters<Faker["location"]["timeZone"]>
    ) => Primitive.string.Schema;
    readonly zipCode: (
      ...args: Parameters<Faker["location"]["zipCode"]>
    ) => Primitive.string.Schema;
  };
  readonly lorem: {
    readonly lines: (
      ...args: Parameters<Faker["lorem"]["lines"]>
    ) => Primitive.string.Schema;
    readonly paragraph: (
      ...args: Parameters<Faker["lorem"]["paragraph"]>
    ) => Primitive.string.Schema;
    readonly paragraphs: (
      ...args: Parameters<Faker["lorem"]["paragraphs"]>
    ) => Primitive.string.Schema;
    readonly sentence: (
      ...args: Parameters<Faker["lorem"]["sentence"]>
    ) => Primitive.string.Schema;
    readonly sentences: (
      ...args: Parameters<Faker["lorem"]["sentences"]>
    ) => Primitive.string.Schema;
    readonly slug: (
      ...args: Parameters<Faker["lorem"]["slug"]>
    ) => Primitive.string.Schema;
    readonly text: (
      ...args: Parameters<Faker["lorem"]["text"]>
    ) => Primitive.string.Schema;
    readonly word: (
      ...args: Parameters<Faker["lorem"]["word"]>
    ) => Primitive.string.Schema;
    readonly words: (
      ...args: Parameters<Faker["lorem"]["words"]>
    ) => Primitive.string.Schema;
  };
  readonly music: {
    readonly album: (
      ...args: Parameters<Faker["music"]["album"]>
    ) => Primitive.string.Schema;
    readonly artist: (
      ...args: Parameters<Faker["music"]["artist"]>
    ) => Primitive.string.Schema;
    readonly genre: (
      ...args: Parameters<Faker["music"]["genre"]>
    ) => Primitive.string.Schema;
    readonly songName: (
      ...args: Parameters<Faker["music"]["songName"]>
    ) => Primitive.string.Schema;
  };
  readonly number: {
    readonly bigInt: (
      ...args: Parameters<Faker["number"]["bigInt"]>
    ) => Primitive.bigint.Schema;
    readonly binary: (
      ...args: Parameters<Faker["number"]["binary"]>
    ) => Primitive.string.Schema;
    readonly float: (
      ...args: Parameters<Faker["number"]["float"]>
    ) => Primitive.number.Schema;
    readonly hex: (
      ...args: Parameters<Faker["number"]["hex"]>
    ) => Primitive.string.Schema;
    readonly int: (
      ...args: Parameters<Faker["number"]["int"]>
    ) => Primitive.number.Schema;
    readonly octal: (
      ...args: Parameters<Faker["number"]["octal"]>
    ) => Primitive.string.Schema;
    readonly romanNumeral: (
      ...args: Parameters<Faker["number"]["romanNumeral"]>
    ) => Primitive.string.Schema;
  };
  readonly person: {
    readonly bio: (
      ...args: Parameters<Faker["person"]["bio"]>
    ) => Primitive.string.Schema;
    readonly firstName: (
      ...args: Parameters<Faker["person"]["firstName"]>
    ) => Primitive.string.Schema;
    readonly fullName: (
      ...args: Parameters<Faker["person"]["fullName"]>
    ) => Primitive.string.Schema;
    readonly gender: (
      ...args: Parameters<Faker["person"]["gender"]>
    ) => Primitive.string.Schema;
    readonly jobArea: (
      ...args: Parameters<Faker["person"]["jobArea"]>
    ) => Primitive.string.Schema;
    readonly jobDescriptor: (
      ...args: Parameters<Faker["person"]["jobDescriptor"]>
    ) => Primitive.string.Schema;
    readonly jobTitle: (
      ...args: Parameters<Faker["person"]["jobTitle"]>
    ) => Primitive.string.Schema;
    readonly jobType: (
      ...args: Parameters<Faker["person"]["jobType"]>
    ) => Primitive.string.Schema;
    readonly lastName: (
      ...args: Parameters<Faker["person"]["lastName"]>
    ) => Primitive.string.Schema;
    readonly middleName: (
      ...args: Parameters<Faker["person"]["middleName"]>
    ) => Primitive.string.Schema;
    readonly prefix: (
      ...args: Parameters<Faker["person"]["prefix"]>
    ) => Primitive.string.Schema;
    readonly sex: (
      ...args: Parameters<Faker["person"]["sex"]>
    ) => Primitive.string.Schema;
    readonly sexType: (
      ...args: Parameters<Faker["person"]["sexType"]>
    ) => Primitive.enum.Schema<
      readonly [
        readonly [number, "female"],
        readonly [number, "generic"],
        readonly [number, "male"],
      ]
    >;
    readonly suffix: (
      ...args: Parameters<Faker["person"]["suffix"]>
    ) => Primitive.string.Schema;
    readonly zodiacSign: (
      ...args: Parameters<Faker["person"]["zodiacSign"]>
    ) => Primitive.string.Schema;
  };
  readonly phone: {
    readonly imei: (
      ...args: Parameters<Faker["phone"]["imei"]>
    ) => Primitive.string.Schema;
    readonly number: (
      ...args: Parameters<Faker["phone"]["number"]>
    ) => Primitive.string.Schema;
  };
  readonly science: {
    readonly chemicalElement: (
      ...args: Parameters<Faker["science"]["chemicalElement"]>
    ) => Primitive.object.Schema<{
      readonly symbol: Primitive.string.Schema;
      readonly name: Primitive.string.Schema;
      readonly atomicNumber: Primitive.number.Schema;
    }>;
    readonly unit: (
      ...args: Parameters<Faker["science"]["unit"]>
    ) => Primitive.object.Schema<{
      readonly name: Primitive.string.Schema;
      readonly symbol: Primitive.string.Schema;
    }>;
  };
  readonly string: {
    readonly alpha: (
      ...args: Parameters<Faker["string"]["alpha"]>
    ) => Primitive.string.Schema;
    readonly alphanumeric: (
      ...args: Parameters<Faker["string"]["alphanumeric"]>
    ) => Primitive.string.Schema;
    readonly binary: (
      ...args: Parameters<Faker["string"]["binary"]>
    ) => Primitive.string.Schema;
    readonly fromCharacters: (
      ...args: Parameters<Faker["string"]["fromCharacters"]>
    ) => Primitive.string.Schema;
    readonly hexadecimal: (
      ...args: Parameters<Faker["string"]["hexadecimal"]>
    ) => Primitive.string.Schema;
    readonly nanoid: (
      ...args: Parameters<Faker["string"]["nanoid"]>
    ) => Primitive.string.Schema;
    readonly numeric: (
      ...args: Parameters<Faker["string"]["numeric"]>
    ) => Primitive.string.Schema;
    readonly octal: (
      ...args: Parameters<Faker["string"]["octal"]>
    ) => Primitive.string.Schema;
    readonly sample: (
      ...args: Parameters<Faker["string"]["sample"]>
    ) => Primitive.string.Schema;
    readonly symbol: (
      ...args: Parameters<Faker["string"]["symbol"]>
    ) => Primitive.string.Schema;
    readonly ulid: (
      ...args: Parameters<Faker["string"]["ulid"]>
    ) => Primitive.string.Schema;
    readonly uuid: (
      ...args: Parameters<Faker["string"]["uuid"]>
    ) => Primitive.string.Schema;
  };
  readonly system: {
    readonly commonFileExt: (
      ...args: Parameters<Faker["system"]["commonFileExt"]>
    ) => Primitive.string.Schema;
    readonly commonFileName: (
      ...args: Parameters<Faker["system"]["commonFileName"]>
    ) => Primitive.string.Schema;
    readonly commonFileType: (
      ...args: Parameters<Faker["system"]["commonFileType"]>
    ) => Primitive.string.Schema;
    readonly cron: (
      ...args: Parameters<Faker["system"]["cron"]>
    ) => Primitive.string.Schema;
    readonly directoryPath: (
      ...args: Parameters<Faker["system"]["directoryPath"]>
    ) => Primitive.string.Schema;
    readonly fileExt: (
      ...args: Parameters<Faker["system"]["fileExt"]>
    ) => Primitive.string.Schema;
    readonly fileName: (
      ...args: Parameters<Faker["system"]["fileName"]>
    ) => Primitive.string.Schema;
    readonly filePath: (
      ...args: Parameters<Faker["system"]["filePath"]>
    ) => Primitive.string.Schema;
    readonly fileType: (
      ...args: Parameters<Faker["system"]["fileType"]>
    ) => Primitive.string.Schema;
    readonly mimeType: (
      ...args: Parameters<Faker["system"]["mimeType"]>
    ) => Primitive.string.Schema;
    readonly networkInterface: (
      ...args: Parameters<Faker["system"]["networkInterface"]>
    ) => Primitive.string.Schema;
    readonly semver: (
      ...args: Parameters<Faker["system"]["semver"]>
    ) => Primitive.string.Schema;
  };
  readonly vehicle: {
    readonly bicycle: (
      ...args: Parameters<Faker["vehicle"]["bicycle"]>
    ) => Primitive.string.Schema;
    readonly color: (
      ...args: Parameters<Faker["vehicle"]["color"]>
    ) => Primitive.string.Schema;
    readonly fuel: (
      ...args: Parameters<Faker["vehicle"]["fuel"]>
    ) => Primitive.string.Schema;
    readonly manufacturer: (
      ...args: Parameters<Faker["vehicle"]["manufacturer"]>
    ) => Primitive.string.Schema;
    readonly model: (
      ...args: Parameters<Faker["vehicle"]["model"]>
    ) => Primitive.string.Schema;
    readonly type: (
      ...args: Parameters<Faker["vehicle"]["type"]>
    ) => Primitive.string.Schema;
    readonly vehicle: (
      ...args: Parameters<Faker["vehicle"]["vehicle"]>
    ) => Primitive.string.Schema;
    readonly vin: (
      ...args: Parameters<Faker["vehicle"]["vin"]>
    ) => Primitive.string.Schema;
    readonly vrm: (
      ...args: Parameters<Faker["vehicle"]["vrm"]>
    ) => Primitive.string.Schema;
  };
  readonly word: {
    readonly adjective: (
      ...args: Parameters<Faker["word"]["adjective"]>
    ) => Primitive.string.Schema;
    readonly adverb: (
      ...args: Parameters<Faker["word"]["adverb"]>
    ) => Primitive.string.Schema;
    readonly conjunction: (
      ...args: Parameters<Faker["word"]["conjunction"]>
    ) => Primitive.string.Schema;
    readonly interjection: (
      ...args: Parameters<Faker["word"]["interjection"]>
    ) => Primitive.string.Schema;
    readonly noun: (
      ...args: Parameters<Faker["word"]["noun"]>
    ) => Primitive.string.Schema;
    readonly preposition: (
      ...args: Parameters<Faker["word"]["preposition"]>
    ) => Primitive.string.Schema;
    readonly sample: (
      ...args: Parameters<Faker["word"]["sample"]>
    ) => Primitive.string.Schema;
    readonly verb: (
      ...args: Parameters<Faker["word"]["verb"]>
    ) => Primitive.string.Schema;
    readonly words: (
      ...args: Parameters<Faker["word"]["words"]>
    ) => Primitive.string.Schema;
  };
};
