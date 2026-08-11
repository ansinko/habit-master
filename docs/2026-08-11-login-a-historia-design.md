# Habit Master — prihlásenie a história behov

**Dátum:** 2026-08-11
**Stav:** odsúhlasený návrh, pripravený na implementačný plán

## Problém

Habit Master je dnes statická stránka: `index.html` + `app.js`, nasadená na
https://habit-master-gilt.vercel.app, celý stav v `localStorage` jedného
prehliadača. Z toho plynú dva konkrétne nedostatky:

1. **Dáta neprežijú zariadenie.** Vyčistený prehliadač alebo nový telefón =
   výzva od nuly. Nič to nezachytáva.
2. **História neexistuje a ani sa nemá kde vziať.** `reset()` (`app.js:258`)
   vymaže `state.habit` aj `state.logged`. Začatie novej výzvy predchádzajúcu
   zničí. Appka nevie, že si niekedy nejakú dokončil.

Cieľ: prihlásenie, dáta na serveri, a zoznam odbehnutých výziev — aby mala
appka pamäť a tým aj zmysel vracať sa do nej.

## Rozsah

**V rozsahu:** prihlásenie (pozvánkou), serverové úložisko aktívneho behu a
jeho splnených dní, história uzavretých behov, import existujúceho
`localStorage` stavu pri prvom prihlásení.

**Mimo rozsah:** prepojenie so Stewardom (viď *Väzba na Steward* nižšie),
voliteľná dĺžka výzvy, sociálne funkcie, notifikácie, offline sync engine.

## Rozhodnutia

### Používatelia

Multi-user, ale **pozvánkou** — používateľ a pár pozvaných ľudí. Každý má
vlastný aktívny beh a vlastnú históriu. Rieši sa Clerk režimom *restricted
sign-up*: zaregistrovať sa vie len pozvaná e-mailová adresa. Žiadny vlastný
kód na pozvánky.

### Tvar aplikácie

`index.html` a `app.js` zostávajú vanilla a nedotknuté v tom, čo sa týka
vzhľadu a animácií. Pribudne adresár `/api` s Vercel Functions a tenká vrstva
na volanie servera.

Prepis na Next.js bol zvážený a zamietnutý: 684 riadkov ručne ladeného DOM-u,
SVG cestičiek a časovaní by sa prenášalo do Reactu s vysokým rizikom regresie
práve toho, na čom v tomto projekte najviac záleží.

### Dĺžka výzvy

Zostáva natvrdo 66 dní (`CONFIG.goalDays`). Stĺpec `goal_days` v databáze
napriek tomu bude — otvorenie voľby neskôr tak nevyžiada migráciu. Dôvod pre
teraz: menej rozhodovania pri štarte a citáty aj fázy sú vyladené na túto dĺžku.

## Doménový model

**Beh (`run`)** — jedna výzva od začiatku do konca. Nový pojem; appka ho dnes
nemá, čo je presne dôvod, prečo nemá históriu.

```
run
  id          text primary key
  user_id     text not null          -- Clerk user id
  habit_name  text not null
  goal_days   int  not null default 66
  start_date  date not null          -- deň 1
  status      text not null          -- 'active' | 'finished' | 'abandoned'
  ended_at    date                   -- null, kým beh beží
  created_at  timestamptz not null default now()

run_day
  id       text primary key
  run_id   text not null references run(id) on delete cascade
  date     date not null
  unique (run_id, date)
```

**Invariant:** používateľ má najviac jeden beh so `status = 'active'`.
Vynucuje sa parciálnym unique indexom `(user_id) where status = 'active'`, nie
len aplikačnou logikou.

### Prečo kalendárne dátumy, nie indexy dní

`run_day.date` je **kalendárny dátum**, nie poradie dňa 1..66. Index dňa si
appka dopočíta z `start_date` rovnako, ako to už dnes robí `todayIndex()`, takže
citáty, fázy aj míľniky fungujú bez zmeny logiky.

Dôvod pre disk: Steward `HabitEntry` je `{habitId, date}` s
`unique(habitId, date)`. Zhodný tvar znamená, že neskoršie prepojenie je
mapovací skript, nie prepis dátového modelu.

### Sémantika resetu

`reset()` prestane mazať. Namiesto toho:

1. Aktívny beh sa uzavrie — `status = 'abandoned'`, `ended_at = dnes`.
2. Založí sa nový beh s novým `habit_name` a `start_date = dnes`.

Toto je celý mechanizmus histórie. Žiadna samostatná tabuľka archívu.

### Kedy sa beh končí

Beh je **ukotvený v kalendári**, nie v počte splnených dní — to je doktrína,
ktorú appka drží od začiatku (`app.js`, úvodný komentár: *day N ends the run no
matter what. A missed day stays missed*). Preto:

- Beh sa uzavrie ako `'finished'`, keď uplynie jeho kalendárne okno, teda keď
  je dnešok neskorší než `start_date + goal_days - 1`. **Bez ohľadu na to,
  koľko dní v ňom bolo splnených** — dokončiť výzvu s 40/66 je legitímny
  výsledok a história ho takto ukáže.
- `'abandoned'` je vyhradené pre beh, ktorý používateľ ukončil predčasne tým,
  že založil nový.

Uzavretie po uplynutí okna nemá cron — vyhodnotí sa lenivo pri
`GET /api/state`: keď je okno za nami, endpoint beh uzavrie a vráti
`{ run: null }`.

### Odvodené hodnoty

Z `run` + `run_day` sa počíta a **neukladá**: splnené/cieľ, percento,
aktuálny streak, najdlhší streak, počet zostávajúcich dní, rozsah dátumov.
Rovnaká úvaha ako v Stewarde pri *Pace* — odvodené veci sa nedenormalizujú.

## Autentifikácia

**Clerk**, natívna Vercel Marketplace integrácia (`vercel integration add clerk`),
env premenné sa naprovizujú automaticky.

Vo vanilla appke: `@clerk/clerk-js` sa načíta v `index.html`, drží session a
vydáva token. Každá funkcia v `/api` si token overí cez `@clerk/backend` a
vytiahne z neho `userId`. Bez platného tokenu vracia **401** — vrátane
`GET /api/state`.

`user_id` je Clerk identifikátor, nie e-mail. E-mail sa v databáze nedrží.

## API

Štyri endpointy, všetky autentifikované:

```
GET  /api/state            aktívny beh + jeho splnené dni; { run: null } keď žiadny nie je
POST /api/runs             { habitName } → založí beh, prípadný aktívny uzavrie ako 'abandoned'
POST /api/runs/:id/days    { date, done } → označí alebo odznačí deň
GET  /api/runs             história: uzavreté behy, najnovší prvý
```

`POST /api/runs/:id/days` je **idempotentný**: označenie stojí na
`insert ... on conflict (run_id, date) do nothing`, odznačenie na `delete`.
Opakovaná požiadavka teda nevie vytvoriť duplicitu ani spadnúť — podstatné,
lebo klient bude zlyhané zápisy skúšať znova.

Endpoint overuje, že `run_id` patrí prihlásenému používateľovi, a odmieta
dátum mimo rozsahu `start_date .. start_date + goal_days - 1` a dátum v
budúcnosti.

## Úložisko

**Neon Postgres** cez Vercel Marketplace (`vercel integration add neon`),
prístup cez `@neondatabase/serverless`, čisté SQL.

ORM sa nepoužije zámerne: sú to dve tabuľky a približne šesť dotazov. Prisma
alebo Drizzle by pridali generovanie, migračný nástroj a build krok do repa,
ktoré dnes nemá ani `package.json`.

Schéma sa zavedie jedným `schema.sql` a aplikuje ručne. Migračný nástroj sa
zavedie až keď príde druhá zmena schémy.

## Klient

`load()` a `save()` prestanú byť zdrojom pravdy. Nový tok:

1. Pri štarte sa vykreslí posledný známy stav z `localStorage` — appka na
   mobile nabehne okamžite a neblikne prázdna.
2. Súbežne beží `GET /api/state`. Odpoveď prepíše stav aj cache.
3. Označenie dňa sa najprv prejaví v UI, potom ide na server. Keď zápis
   zlyhá, políčko sa vráti späť a ukáže sa toast.

`localStorage` teda zostáva, ale degraduje z databázy na cache. **Nestavia sa
sync engine** — žiadna fronta zmien, žiadne riešenie konfliktov. Pri jednom
aktívnom behu a jednom človeku je to mašinéria bez úžitku; zlyhaný zápis sa
rieši tým, že sa zopakuje, a keďže je idempotentný, nemôže uškodiť.

Pribudne obrazovka histórie. Zvyšok `app.js` — fázy, míľniky, citáty, SVG
cestičky, časovania — sa nemení.

## Migrácia existujúceho stavu

Pri prvom prihlásení, ak `localStorage` obsahuje rozbehnutý habit a
`GET /api/state` vráti `{ run: null }`, appka ponúkne import. Prevod:
`state.habit` → `habit_name`, `state.startDay` → `start_date`, každý index v
`state.logged` → `run_day.date` ako `start_date + (index - 1)`.

Import je jednorazový a používateľ ho musí potvrdiť. Odmietnutie ponuku
zahodí a založí sa prázdny stav.

## Ošetrenie chýb

| Situácia | Správanie |
|---|---|
| Chýbajúci alebo neplatný token | 401, klient presmeruje na prihlásenie |
| `run_id` patrí inému používateľovi | 404 (nie 403 — neprezrádza existenciu) |
| Dátum mimo rozsahu behu alebo v budúcnosti | 400, políčko sa nezmení |
| Opakované označenie toho istého dňa | 200, žiadna zmena (idempotencia) |
| Zápis zlyhá (sieť, DB) | UI vráti políčko späť, toast, deň nie je stratený |
| Neon nedostupný pri štarte | Appka beží nad cache a ukáže, že je odpojená |

## Overovanie

V repe nie je testovacia infraštruktúra a nezavádza sa kvôli tomuto tu — nad
ručne písaným DOM-om a animáciami by unit testy nedali pomer cena/úžitok.

Namiesto toho:

1. **Smoke skript** proti preview deploymentu: prejde všetky štyri endpointy,
   overí 401 bez tokenu, dvojité označenie toho istého dňa, odznačenie,
   uzavretie behu pri založení nového a to, že cudzí `run_id` vráti 404.
2. **Manuálny checklist na mobile:** prihlásenie, označenie dňa, tvrdý reload
   (stav prežil), let mode a označenie (toast, políčko sa vráti), založenie
   nového behu (starý je v histórii), import z localStorage.

## Väzba na Steward

Steward má vlastné habity (`Habit` + `HabitEntry`), vlastný login (Better Auth)
a **nie je nasadený** — beží len lokálne cez Docker, `DATABASE_URL` mieri na
`localhost:5432`. ADR-0003 nasadenie na Vercel schválilo 2026-07-19, ale
nevykonalo sa.

Tento návrh teda vedome vytvára **druhú identitu a druhý zdroj pravdy o
habitoch**. Je to prijatá cena za to, že Habit Master má dávať zmysel sám o
sebe a hneď, bez toho, aby čakal na nasadenie Stewarda.

Cena je zlacnená dvomi rozhodnutiami:

- `run_day.date` má rovnaký tvar ako `HabitEntry.date`, takže prenos dní je
  priame mapovanie.
- Jeden beh zodpovedá jednému Steward `Habit` (podľa `habit_name`), takže
  prenos je „založ habit, vlož jeho dni".

Prepojenie sa nerieši v tomto rozsahu a bude si vyžadovať vlastný návrh, keď
bude Steward dostupný. Do tej doby Habit Master o Stewarde nevie.
