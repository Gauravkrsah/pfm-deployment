#!/bin/bash

# ============================================================
# LaTeX Build Script for PFM Documentation
# ============================================================
# 
# Usage: ./build.sh
# 
# This script compiles the LaTeX documentation into a PDF.
# It runs multiple passes to resolve references and citations.
#
# Prerequisites:
#   - texlive-full or texlive-latex-extra
#   - bibtex (for references)
#
# Install on Ubuntu/Debian:
#   sudo apt-get install texlive-full
#
# ============================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PFM Documentation Build Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Create output directory if it doesn't exist
mkdir -p output

echo -e "\n${YELLOW}[1/5] First LaTeX pass...${NC}"
pdflatex -output-directory=output -interaction=nonstopmode main.tex > /dev/null 2>&1 || {
    echo -e "${RED}First pass failed. Running with full output:${NC}"
    pdflatex -output-directory=output main.tex
    exit 1
}
echo -e "${GREEN}      Done.${NC}"

echo -e "\n${YELLOW}[2/5] Running BibTeX for references...${NC}"
cd output
bibtex main > /dev/null 2>&1 || echo -e "${YELLOW}      BibTeX warnings (this is often normal)${NC}"
cd ..
echo -e "${GREEN}      Done.${NC}"

echo -e "\n${YELLOW}[3/5] Second LaTeX pass (resolving references)...${NC}"
pdflatex -output-directory=output -interaction=nonstopmode main.tex > /dev/null 2>&1
echo -e "${GREEN}      Done.${NC}"

echo -e "\n${YELLOW}[4/5] Third LaTeX pass (finalizing)...${NC}"
pdflatex -output-directory=output -interaction=nonstopmode main.tex > /dev/null 2>&1
echo -e "${GREEN}      Done.${NC}"

echo -e "\n${YELLOW}[5/5] Renaming output file...${NC}"
if [ -f "output/main.pdf" ]; then
    cp output/main.pdf output/pfm-report.pdf
    echo -e "${GREEN}      Done.${NC}"
else
    echo -e "${RED}      Error: PDF not generated${NC}"
    exit 1
fi

# Clean up auxiliary files (optional)
# Uncomment to remove aux files after build
# rm -f output/*.aux output/*.log output/*.toc output/*.lof output/*.lot output/*.out output/*.bbl output/*.blg

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\nOutput: ${YELLOW}output/pfm-report.pdf${NC}"
echo -e "Size: $(du -h output/pfm-report.pdf | cut -f1)"
echo ""
