# Drive Drill

Ukraine driving theory practice platform built with Next.js, TypeScript, and Tailwind CSS.

## What is included

- Study mode with instant feedback and saved local progress.
- Practice mode with 20 random questions.
- Exam mode matching the Ukraine theory-test structure: 20 questions, 20 minutes, pass from 18 correct answers.
- Full question bank parsed from the supplied 2025 PDF materials: 2,281 questions across 64 sections.
- Extracted question illustrations stored in `public/question-images` and rendered on the matching questions.

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

## Importing the PDF bank

The importer reads both local PDFs:

- `POLOTNO-NAKAZ_04_09_2025 (1).pdf` for question text and illustrations.
- `Numer_-vidpovidej-do-nakazu.pdf` for the answer key.

Run:

```bash
python3 scripts/import_pdf_bank.py
```

It regenerates:

- `src/data/questions.ts`
- `public/question-images/*`

Temporary parser files are cached in `.import-work/` and ignored by git.

Questions use this shape:

```ts
{
  id: "s1-q080",
  sectionNumber: 1,
  number: 80,
  category: "Загальні положення",
  question: "...",
  options: ["...", "..."],
  correctIndex: 0,
  explanation: "...",
  images: ["/question-images/q-image-0001.jpg"]
}
```
