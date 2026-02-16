# PFM Documentation

This folder contains the LaTeX source files for the Personal Finance Manager academic project report.

## Folder Structure

```
documentation/
├── main.tex                    # Master document
├── preamble.tex                # Document setup, packages, formatting
├── build.sh                    # Build script for PDF generation
│
├── chapters/                   # All chapter content
│   ├── 01-introduction.tex
│   ├── 02-background-literature.tex
│   ├── 03-system-analysis-design.tex
│   ├── 04-implementation-testing.tex
│   └── 05-conclusion.tex
│
├── preliminaries/              # Preliminary pages
│   ├── cover.tex
│   ├── title.tex
│   ├── declaration.tex
│   ├── supervisor-recommendation.tex
│   ├── examiner-approval.tex
│   ├── acknowledgement.tex
│   ├── abstract.tex
│   └── abbreviations.tex
│
├── figures/                    # All diagrams and images
│   ├── diagrams/               # UML and architecture diagrams
│   ├── screenshots/            # Application screenshots
│   └── flowcharts/             # Process flowcharts
│
├── appendices/                 # Appendix content
│   ├── appendix-a-code-samples.tex
│   └── appendix-b-test-cases.tex
│
├── references/                 # Bibliography
│   └── references.bib
│
└── output/                     # Generated PDF output
    └── pfm-report.pdf
```

## Prerequisites

Install LaTeX on your system:

### Ubuntu/Debian
```bash
sudo apt-get install texlive-full
```

### macOS (using Homebrew)
```bash
brew install --cask mactex
```

### Windows
Download and install [MiKTeX](https://miktex.org/) or [TeX Live](https://www.tug.org/texlive/).

## Building the PDF

1. Navigate to the documentation folder:
   ```bash
   cd documentation
   ```

2. Run the build script:
   ```bash
   ./build.sh
   ```

3. The PDF will be generated at `output/pfm-report.pdf`

### Manual Build (without script)

```bash
mkdir -p output
pdflatex -output-directory=output main.tex
bibtex output/main
pdflatex -output-directory=output main.tex
pdflatex -output-directory=output main.tex
```

## Customization

### Editing Personal Details

Open `preamble.tex` and modify the following commands:

```latex
\newcommand{\projecttitle}{Personal Finance Manager (PFM)}
\newcommand{\studentname}{Your Name}
\newcommand{\studentid}{Your Student ID}
\newcommand{\supervisorname}{Supervisor Name}
\newcommand{\supervisortitle}{Supervisor Title}
\newcommand{\collegename}{Your College Name}
\newcommand{\universityname}{Your University Name}
\newcommand{\submissiondate}{Month Year}
```

### Adding Diagrams

1. Create or export your UML diagrams as PNG/PDF files
2. Place them in the appropriate subfolder under `figures/`:
   - `figures/diagrams/` - UML diagrams
   - `figures/screenshots/` - App screenshots
   - `figures/flowcharts/` - Process flowcharts
3. Update the chapter files to include your diagrams:
   ```latex
   \includegraphics[width=\textwidth]{diagrams/your-diagram.png}
   ```

## Formatting Standards

This document follows academic formatting standards:

| Element | Specification |
|---------|---------------|
| Font | Times New Roman |
| Line Spacing | 1.5 |
| Margins | Left: 1.25", Others: 1" |
| Chapter Headings | 16pt, Bold, Center |
| Sub-headings | 14pt, Bold, Left |
| Body Text | 12pt |
| Page Numbers (Prelim) | Roman numerals (i, ii, iii) |
| Page Numbers (Body) | Arabic numerals (1, 2, 3) |
| References | IEEE format |

## Troubleshooting

### Missing Packages

If you get package errors, install the required LaTeX packages:
```bash
sudo apt-get install texlive-fonts-extra texlive-science
```

### BibTeX Errors

BibTeX warnings about missing citations are normal on first build. Running the build script (which does multiple passes) should resolve them.

### Font Issues

If Times New Roman doesn't render correctly, ensure you have the `newtx` package:
```bash
sudo apt-get install texlive-fonts-extra
```
