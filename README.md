# Drive Drill

Ukraine driving theory practice platform built with Next.js, TypeScript, and Tailwind CSS.

## What is included

- Study mode with instant feedback and saved local progress.
- Practice mode with 20 random questions.
- Exam mode matching the Ukraine theory-test structure: 20 questions, 20 minutes, pass from 18 correct answers.
- Question bank seeded from the supplied 2025 PDF materials, currently normalized for Section 1: `Загальні положення`.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npm run build
```

## Vercel

Push this repository to GitHub and import it in Vercel. The default settings work:

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: `.next`

## Expanding the bank

Questions live in `src/data/questions.ts`. Add records using the existing `Question` shape:

```ts
{
  id: "general-080",
  number: 80,
  category: "Загальні положення",
  question: "...",
  options: ["...", "..."],
  correctIndex: 0,
  explanation: "..."
}
```
