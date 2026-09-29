# PRD — Mobile Personal Finance Tracker

**Working name:** Personal Finance Assistant
**Platform:** Telegram Bot + Mobile WebApp
**Primary interface:** Mobile
**Product model:** Free core + optional Premium

The key product decision I'd make is:

> **Telegram = capture money instantly. WebApp = understand and manage money.**

That fits your existing architecture much better than trying to turn the WebApp into another traditional expense tracker.

---

# 1. Product Vision

A personal finance assistant that makes recording money **as easy as sending a Telegram message**, while providing a mobile dashboard for understanding spending, budgets, savings, and net worth.

### Example

User sends:

> `lunch 25k`

Bot understands:

```text
Expense
Amount: Rp25,000
Category: Food
Date: Today
Note: lunch
```

Bot responds:

> 🍜 Food — Rp25.000
> Today: Rp85.000
> Budget: Rp250.000 / Rp500.000

The user doesn't need to open the WebApp.

When they want deeper analysis:

**Telegram → Open Finance Dashboard**

---

# 2. Target Users

### Primary

People who:

* use Telegram regularly
* want simple personal expense tracking
* don't want to maintain spreadsheets
* want quick transaction entry
* primarily use their phone
* don't necessarily understand accounting

### Secondary

Users who want:

* monthly budgeting
* savings goals
* net-worth tracking
* financial reports
* recurring bills
* spending insights

---

# 3. Core Product Loop

The entire product should revolve around this loop:

```text
        ┌───────────────┐
        │   Earn / Spend│
        └───────┬───────┘
                ↓
       ┌─────────────────┐
       │ Capture via     │
       │ Telegram        │
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │ Categorize      │
       │ automatically   │
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │ Track            │
       │ budgets/goals    │
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │ Understand       │
       │ dashboard        │
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │ Improve behavior │
       └─────────────────┘
```

The **capture → feedback loop** should be extremely fast.

---

# 4. Product Architecture

```text
                    TELEGRAM
                       │
            ┌──────────┴──────────┐
            │                     │
       Text message           Telegram UI
            │                     │
            └──────────┬──────────┘
                       ↓
                 Finance API
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
 Transaction       Budget          Goals
 Engine             Engine          Engine
       │               │               │
       └───────────────┼───────────────┘
                       ↓
                 Finance DB
                       │
                       ↓
                  Mobile WebApp
                       │
          ┌────────────┼─────────────┐
          ↓            ↓             ↓
       Dashboard   Transactions   Analytics
```

---

# 5. Mobile WebApp Information Architecture

I'd keep the bottom navigation to **5 items maximum**.

```text
┌─────────────────────────┐
│                         │
│       CONTENT           │
│                         │
│                         │
│                         │
├─────────────────────────┤
│ Home │ Tx │ + │ Budget │ More │
└─────────────────────────┘
```

### Navigation

**Home**

* financial overview
* spending
* budget
* goals
* insights

**Transactions**

* transaction history
* search
* filters
* edit/delete

**+**

* add transaction
* income
* expense
* transfer

**Budget**

* budgets
* goals
* recurring

**More**

* reports
* net worth
* categories
* settings
* import/export

The center `+` should be visually prominent.

---

# 6. Home Dashboard

The dashboard should **not look like an accounting application**.

It should answer:

> "How am I doing financially?"

### Wireframe

```text
┌─────────────────────────┐
│ Good morning 👋         │
│ September 2026      ⚙  │
├─────────────────────────┤
│                         │
│       NET BALANCE       │
│                         │
│      Rp 12.450.000      │
│       ↑ Rp 1.2M         │
│                         │
├─────────────────────────┤
│  Income       Expense   │
│  Rp15.2M      Rp2.8M    │
├─────────────────────────┤
│                         │
│  Financial Health       │
│                         │
│        78 / 100         │
│       ████████░░         │
│                         │
│  Saving rate       32%  │
├─────────────────────────┤
│                         │
│  This month             │
│                         │
│  Food             850k  │
│  Transport        420k  │
│  Shopping         310k  │
│  Bills            280k  │
│                         │
│       View all →        │
├─────────────────────────┤
│                         │
│  Budget                 │
│                         │
│  Food       ███████░ 85%│
│  Transport  ████░░░ 52% │
│  Shopping   █████████ 96%│
│                         │
├─────────────────────────┤
│                         │
│  Goals                  │
│                         │
│  Emergency Fund         │
│  ███████░░░ 72%         │
│                         │
└─────────────────────────┘
```

---

# 7. Telegram as the "Quick Capture" Interface

This is where your existing Telegram bot becomes a significant advantage.

The user should **never have to learn a rigid command syntax**.

Support natural messages:

```text
lunch 25000
```

```text
bensin 100k
```

```text
gaji 12jt
```

```text
bayar listrik 350k
```

```text
kopi 25rb
```

```text
received salary 12m
```

The parser extracts:

```json
{
  "type": "expense",
  "amount": 25000,
  "currency": "IDR",
  "category": "food",
  "description": "lunch",
  "date": "2026-09-29"
}
```

---

# 8. Transaction Confirmation

Don't immediately save ambiguous transactions.

Example:

> `beli sepatu 800k`

Bot:

```text
👟 New expense

Rp800.000
Category: Shopping
Today

Save this transaction?

[ ✅ Save ] [ ✏️ Edit ]
```

For high-confidence transactions:

> `kopi 20k`

You can simply respond:

```text
☕ Food
-Rp20.000

Today: Rp145.000
Food budget: 48%

[Undo]
```

This creates a very fast UX.

---

# 9. Smart Telegram Commands

Natural language should be primary, but commands are useful.

### Transaction

```text
/add
```

```text
/income
```

```text
/expense
```

```text
/transfer
```

### Finance

```text
/balance
```

```text
/today
```

```text
/month
```

```text
/budget
```

```text
/goals
```

### Analytics

```text
/report
```

```text
/insights
```

```text
/networth
```

---

# 10. Transaction Screen

### Wireframe

```text
┌─────────────────────────┐
│ ← Transactions      🔍  │
├─────────────────────────┤
│ September 2026          │
│                         │
│ TODAY                   │
│                         │
│ 🍜 Lunch       -25.000  │
│ ☕ Coffee      -20.000  │
│ ⛽ Fuel       -100.000  │
│                         │
│ YESTERDAY               │
│                         │
│ 🛒 Groceries  -450.000  │
│                         │
│ 💼 Salary   +12.000.000 │
│                         │
├─────────────────────────┤
│                         │
│      + Add transaction  │
└─────────────────────────┘
```

Swipe transaction:

```text
← Edit
→ Delete
```

Or tap → detail screen.

---

# 11. Add Transaction

Keep this extremely simple.

```text
┌─────────────────────────┐
│ ← Add transaction       │
├─────────────────────────┤
│                         │
│        EXPENSE          │
│                         │
│       Rp 25.000         │
│                         │
│  [ Expense ] [ Income ] │
│                         │
│  Category               │
│  🍜 Food             >  │
│                         │
│  Description            │
│  Lunch                  │
│                         │
│  Date                   │
│  Today               >  │
│                         │
│  Account                │
│  Cash                >  │
│                         │
│                         │
│     [ Save ]            │
└─────────────────────────┘
```

Don't expose advanced fields initially.

Put:

> More options

at the bottom.

---

# 12. Categories

Default categories:

### Expense

* Food
* Transport
* Housing
* Bills
* Shopping
* Entertainment
* Health
* Education
* Family
* Travel
* Personal
* Other

### Income

* Salary
* Business
* Freelance
* Investment
* Gift
* Other

Users can customize these.

---

# 13. Budget System

Budget should be **category based** initially.

Example:

```text
September

Food
Rp850k / Rp1.5M

████████░░░░ 57%

Rp650k remaining
```

### Budget states

```text
0–70%     Normal
70–90%    Attention
90–100%   Near limit
>100%     Over budget
```

Avoid aggressive red warning UX.

---

# 14. Budget Detail

```text
┌─────────────────────────┐
│ ← Food Budget           │
├─────────────────────────┤
│                         │
│       Rp850.000         │
│       / Rp1.500.000     │
│                         │
│ ████████░░░░ 57%        │
│                         │
│ Rp650.000 remaining     │
│                         │
├─────────────────────────┤
│ Spending                │
│                         │
│ Sep 01       45k        │
│ Sep 02       70k        │
│ Sep 03       25k        │
│ ...                     │
├─────────────────────────┤
│ Forecast                │
│                         │
│ Expected: Rp1.320.000   │
│                         │
│ Within budget ✓         │
└─────────────────────────┘
```

---

# 15. Savings Goals

Example:

```text
Emergency Fund

Target
Rp20.000.000

Current
Rp12.500.000

████████████░░░░ 62%

Rp7.500.000 remaining

[ + Add money ]
```

Goal types:

* Emergency fund
* Vacation
* Car
* House
* Education
* Custom

---

# 16. Net Worth

This should be a separate feature rather than mixed into monthly cash flow.

```text
┌─────────────────────────┐
│ Net Worth               │
├─────────────────────────┤
│                         │
│      Rp185.000.000      │
│                         │
│      ↑ Rp8.2M           │
│                         │
│ ─────────╮              │
│          ╰───╮          │
│              ╰────      │
│                         │
├─────────────────────────┤
│ Assets                  │
│                         │
│ Cash          15M       │
│ Bank          50M       │
│ Investment    120M      │
│ Property      80M       │
│                         │
├─────────────────────────┤
│ Liabilities             │
│                         │
│ Credit card   10M       │
│ Loan          70M       │
└─────────────────────────┘
```

Calculation:

```text
Net Worth = Total Assets - Total Liabilities
```

---

# 17. Recurring Transactions

This is important for automation.

Examples:

```text
Netflix
Rp186.000
Every month
Next: Oct 5
```

```text
Salary
Rp12.000.000
Every month
Next: Oct 25
```

Support:

* daily
* weekly
* monthly
* yearly
* custom interval
* start date
* end date
* pause
* resume

---

# 18. Financial Health Score

I would **not make this the first feature users see during onboarding**.

Once enough data exists:

```text
Financial Health

        78
       /100

███████████████░░░░

Saving rate          32%
Budget adherence     86%
Positive months      5/6
Goal progress        72%
```

The score should be explainable.

For example:

```text
Your score increased +6

+4  Better budget adherence
+3  Higher saving rate
-1  Increased discretionary spending
```

Avoid creating a mysterious "AI score".

---

# 19. Personal Benchmarks

This is where the product becomes more useful than a simple ledger.

Example:

```text
Your spending vs your usual

Food
       +18%

Transport
       -12%

Shopping
       +37%

Entertainment
       -24%
```

The comparison should be based on the user's own historical data.

For example:

```text
Current 3-month average
vs
Previous 6-month average
```

The exact algorithm should be configurable.

---

# 20. Insights

Instead of dumping charts on the user, generate actionable observations.

Example:

```text
💡 Insight

Your restaurant spending is
28% higher than your usual
monthly average.

You've spent Rp840k this month.

Your normal range is
Rp500k–Rp700k.
```

Another:

```text
💡 Good progress

You saved Rp2.1M this month.

That's 17% more than your
average over the last 3 months.
```

Important: these are **descriptive insights**, not financial advice.

---

# 21. Reports

Mobile report screen:

```text
┌─────────────────────────┐
│ Reports                 │
├─────────────────────────┤
│ September 2026       ▼  │
├─────────────────────────┤
│                         │
│ Income       Rp15.2M    │
│ Expenses      Rp2.8M    │
│ Saved        Rp12.4M    │
│                         │
├─────────────────────────┤
│ Spending                │
│                         │
│ Food           850k     │
│ Transport      420k     │
│ Shopping       310k     │
│ Bills          280k     │
│                         │
├─────────────────────────┤
│ Income vs Expense       │
│                         │
│       ╭──╮              │
│   ╭───╯  ╰──╮           │
│ ──╯         ╰──         │
│                         │
└─────────────────────────┘
```

---

# 22. CSV Import

Import flow:

```text
Upload CSV
     ↓
Detect columns
     ↓
Map columns
     ↓
Preview
     ↓
Validate
     ↓
Import
```

Example mapping:

```text
CSV column       → Finance field

Date             → Date
Description      → Description
Amount           → Amount
Type             → Transaction type
Category         → Category
```

Show a preview before committing.

---

# 23. CSV Export

Allow:

```text
Export transactions

Date range:
[ Sep 1 ] — [ Sep 30 ]

Format:
[ CSV ]

[ Export ]
```

Potential future formats:

* CSV
* XLSX
* JSON
* PDF report

---

# 24. Telegram ↔ WebApp Integration

This should be one of your strongest differentiators.

Example Telegram:

```text
You:
Dinner 180k

Bot:
🍜 Food
-Rp180.000

September Food:
Rp1.24M / Rp1.5M

[Open Dashboard]
```

Clicking **Open Dashboard** opens the WebApp directly on:

```text
Food budget
```

not the homepage.

Deep links are important.

Examples:

```text
/dashboard
/transactions
/transaction/{id}
/budget/{id}
/goal/{id}
/report
```

---

# 25. Telegram Mini UI

Telegram can also use inline buttons:

```text
Expense recorded

Rp180.000
Food

[ ✏️ Edit ] [ 🗑 Delete ]

[ 📊 Dashboard ]
```

For ambiguous categorization:

```text
Where should I categorize this?

"beli kebutuhan rumah"

[ 🏠 Household ]
[ 🛒 Shopping ]
[ 📦 Other ]
```

This creates a feedback mechanism for improving categorization.

---

# 26. AI / NLP Layer

You don't need a huge model.

Architecture:

```text
Telegram message
       ↓
Intent detection
       ↓
Entity extraction
       ↓
Category classification
       ↓
Validation
       ↓
Transaction
```

Extract:

```json
{
  "intent": "create_transaction",
  "type": "expense",
  "amount": 25000,
  "currency": "IDR",
  "description": "kopi",
  "date": "today",
  "category": "food"
}
```

For your use case, **small/cheap models or deterministic parsing should handle most transactions**.

Don't use an expensive reasoning model for every message.

---

# 27. Transaction Data Model

Core table:

```text
transactions

id
user_id

type
  expense
  income
  transfer

amount
currency

category_id

account_id

description
note

transaction_date

created_at
updated_at

recurring_transaction_id

metadata
```

---

# 28. Accounts

I strongly recommend adding accounts even if the initial version doesn't expose them heavily.

```text
accounts

id
user_id

name
type
currency

balance

is_active
```

Types:

```text
Cash
Bank
E-wallet
Credit Card
Investment
Other
```

Example:

```text
BCA
Rp8.200.000

GoPay
Rp450.000

Cash
Rp750.000
```

This enables proper balance tracking later.

---

# 29. Categories

```text
categories

id
user_id

name
type

icon
color

parent_id

is_default
is_active
```

`parent_id` allows:

```text
Food
 ├── Restaurant
 ├── Groceries
 ├── Coffee
 └── Delivery
```

---

# 30. Budgets

```text
budgets

id
user_id

category_id

amount
currency

period
  monthly
  weekly
  yearly

start_date
end_date

alert_threshold

is_active
```

---

# 31. Goals

```text
goals

id
user_id

name

target_amount
current_amount

target_date

category

status

created_at
```

---

# 32. Recurring Transactions

```text
recurring_transactions

id
user_id

type
amount

category_id
account_id

description

frequency
interval

start_date
end_date

next_run_at

status
```

---

# 33. Net Worth

Assets and liabilities should be modeled separately.

```text
financial_positions

id
user_id

account_id

type
  asset
  liability

value

recorded_at
```

Historical snapshots allow:

```text
Jan     120M
Feb     128M
Mar     134M
Apr     140M
...
```

---

# 34. User Settings

```text
users

id
telegram_id

name

currency
locale

timezone

first_day_of_month

created_at
```

For your Indonesian audience, default:

```text
currency = IDR
locale = id-ID
timezone = Asia/Jakarta
```

But don't hard-code these assumptions into the database.

---

# 35. MVP

I would **not build all of the above initially**.

Your MVP should be:

### Telegram

* Natural language transaction entry
* Expense
* Income
* Category detection
* Confirmation
* Edit
* Delete
* `/today`
* `/month`
* `/budget`

### WebApp

* Dashboard
* Transactions
* Add transaction
* Categories
* Budgets
* Basic reports
* Settings

### Backend

* Users
* Transactions
* Categories
* Accounts
* Budgets

That is enough to launch.

---

# 36. Phase 2

Then add:

```text
Recurring transactions
        ↓
Savings goals
        ↓
Net worth
        ↓
CSV import/export
        ↓
Personal benchmarks
        ↓
Financial health
```

---

# 37. Phase 3

Then:

```text
AI insights
Cash-flow forecasting
Smart notifications
Advanced reports
Split transactions
Multiple accounts
Advanced recurring rules
```

---

# 38. Onboarding

Don't make users fill out a giant finance form.

### Telegram

```text
👋 Welcome!

I'll help you track your money.

What currency do you use?

[ 🇮🇩 IDR ]
[ 🇺🇸 USD ]
[ 🇪🇺 EUR ]
[ Other ]
```

Then:

```text
Great.

You can simply tell me things like:

"lunch 25k"
"salary 12jt"
"bensin 100k"
```

Then immediately let them record their first transaction.

---

# 39. First WebApp Screen

After onboarding:

```text
┌─────────────────────────┐
│ 👋 Welcome              │
│                         │
│ Let's get your finances │
│ organized.              │
│                         │
│ ┌─────────────────────┐ │
│ │ Add your first      │ │
│ │ transaction         │ │
│ │                     │ │
│ │       + Add         │ │
│ └─────────────────────┘ │
│                         │
│ Or simply use Telegram  │
│                         │
│ "lunch 25k"             │
│                         │
└─────────────────────────┘
```

---

# 40. Mobile Design Principles

I'd make these explicit requirements in the PRD.

### 1. One-handed operation

Primary controls should be reachable by thumb.

### 2. Minimal typing

Especially for transactions.

### 3. Large numbers

Money amounts should be highly readable.

### 4. Progressive disclosure

Don't show:

* notes
* tags
* recurring rules
* account details
* advanced options

until they're needed.

### 5. Telegram-first capture

The user shouldn't need to launch the WebApp every time they spend money.

### 6. Dashboard-first understanding

The WebApp should answer:

> Where did my money go?

> Am I within budget?

> Am I saving?

> How am I doing compared with previous months?

---

# 41. Recommended Bottom Navigation

My proposed final structure:

```text
┌─────────────────────────────────┐
│                                 │
│             SCREEN              │
│                                 │
│                                 │
├─────────────────────────────────┤
│                                 │
│  🏠       📋       ＋      🎯    ⋯ │
│ Home   Transactions Add   Plan More│
│                                 │
└─────────────────────────────────┘
```

Where:

**Home**
→ financial overview

**Transactions**
→ ledger

**+**
→ create transaction

**Plan**
→ budgets + goals

**More**
→ reports + net worth + settings

---

# 42. Most Important UX Decision

I would avoid copying Personal Finance Tracker literally.

Your existing Telegram architecture gives you something it doesn't naturally have:

```text
Traditional finance app

Open app
   ↓
Find button
   ↓
Enter amount
   ↓
Choose category
   ↓
Save
```

Your system:

```text
User thinks:

"kopi 20k"

        ↓

Telegram

        ↓

Done ✓
```

Then the WebApp becomes the **financial command center**, rather than another place where users have to manually enter data.

That distinction should drive the entire product.

---

# 43. Suggested Product Architecture

If you're building this yourself, I'd structure the backend around these bounded areas:

```text
                    Finance API
                        │
       ┌────────────────┼────────────────┐
       │                │                │
   Transaction       Planning        Analytics
       │                │                │
       ├─ Income        ├─ Budget       ├─ Reports
       ├─ Expense       ├─ Goals        ├─ Benchmarks
       ├─ Transfer      └─ Recurring    ├─ Health
       └─ Category                     └─ Forecast
       │
       ↓
     Accounts
       │
       ↓
   PostgreSQL
```

And:

```text
Telegram Bot ─────┐
                  ├── Finance API ── PostgreSQL
Mobile WebApp ────┘
```

This keeps Telegram and WebApp from having separate business logic.

---

## 44. MVP Success Metrics

I'd measure the product around the **capture loop**, rather than page views.

| Metric                                | What it tells you  |
| ------------------------------------- | ------------------ |
| Transactions/user/month               | Actual usage       |
| % transactions captured via Telegram  | Bot usefulness     |
| Median time to record transaction     | Capture friction   |
| Categorization correction rate        | Parser quality     |
| 7-day retention                       | Initial usefulness |
| 30-day retention                      | Habit formation    |
| Budget creation rate                  | Planning adoption  |
| Monthly active users                  | Product usage      |
| Transactions successfully categorized | Data quality       |

The most important early metric is probably:

> **Median time from sending a Telegram message to a saved transaction.**

I'd aim for **a few seconds**, not tens of seconds.

---

# 45. Final Product Shape

The resulting product becomes:

```text
                    PERSONAL FINANCE
                          │
             ┌────────────┴────────────┐
             │                         │
          TELEGRAM                  WEBAPP
             │                         │
        CAPTURE FAST              UNDERSTAND
             │                         │
       ┌─────┴─────┐         ┌───────┴────────┐
       │           │         │                │
    Expense     Income    Dashboard       Analytics
       │           │         │                │
       └─────┬─────┘         ├─ Budget        │
             │               ├─ Goals         │
             ↓               ├─ Net Worth     │
        Transactions         ├─ Reports       │
                             ├─ Benchmarks    │
                             └─ Insights      │
```

**The core product isn't "an expense tracker."**

It's a **Telegram-native personal finance assistant with a mobile financial dashboard**.

That positioning also gives you a clean path from a relatively simple MVP into the more sophisticated features of the product you referenced.

---

# 46. Decisions & build status (added 2026-09-29)

Review of this PRD against what is live (commit 5f5ffb0, phases 1–4).

### Decisions

| Topic | Decision |
|---|---|
| Confirmation (§8) | **Ask only when unsure.** Known category → save instantly + Undo. Unknown category → ask with category buttons, save on tap. Receipt photos → show **Save / Fix amount** before saving. AI text → save instantly + Undo. |
| Language | **Bahasa Indonesia** for bot and WebApp, all copy in one translations file (English can be added later). |
| Telegram ↔ WebApp (§24) | **Telegram Mini App** with automatic sign-in (signed Telegram initData) + deep links. OTP login stays for normal browsers. |
| Currency (§34, §38) | **IDR only in the MVP**, no currency question at /start, but `currency` is stored on users, accounts and transactions so multi-currency needs no migration later. |
| Financial Health on the dashboard (§6) | **Not in the MVP** (consistent with §18/§36). |
| Swipe gestures (§10) | **Not in the MVP.** Tap → detail screen. |
| Sub-categories (`parent_id`, §29) | Phase 3. |
| Merchant | **Added to the model.** Not in the original PRD, but merchant-based learning is a major accuracy win. |
| Budgets (§30) | Use this PRD's per-category `budgets` table (replaces the earlier "budget fund" concept). |
| Metric §44 | Log capture latency (Telegram message time → saved) from day one. |
| AI model | Gemini 3.5 Flash-Lite, rule-based parser first (see pricing.md). |

### Already built

- Natural-language capture (§7): order-free free parser (`kopi susu 25k indomaret`, `indomaret 25 kopisusu`, `+5jt gaji`) with AI fallback for multi-item/sentences, and receipt photos.
- Categorization feedback loop (§25): category buttons + learned hints per item/merchant.
- Edit/Delete (§8, §25): Category, Fix amount, Delete buttons.
- Shared business logic for bot and web (§43).
- Telegram OTP login, per-user isolation (RLS), usage credits (Free 10 / Pro 100 per day).

### Roadmap (MVP per §35, re-sequenced)

1. **Model alignment**: accounts (type, currency), budgets table, PRD default categories with emoji icons, user settings (currency, locale, first day of month), transfer, capture-latency field.
2. **Bot MVP**: confirmation policy above, rich confirmation (today total + budget %), Undo, `/today` `/month` `/budget` `/balance` `/expense` `/transfer`, Bahasa Indonesia copy.
3. **Mobile WebApp**: bottom nav (Home · Transactions · ＋ · Plan · More), dashboard, transactions (search/filter/edit), add, categories, budgets, basic report, settings; Telegram Mini App + deep links.
4. **Billing** (pricing.md): invoices, promo switch, manual payment.
5. PRD Phase 2 (§36) → Phase 3 (§37).
