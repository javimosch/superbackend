#!/bin/bash

set -eo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Default to current directory if no argument provided
TARGET_DIR="${1:-.}"

# Normalize the path (remove trailing slashes)
TARGET_DIR="${TARGET_DIR%/}"

# Check if directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}Error: Directory '$TARGET_DIR' does not exist${NC}" >&2
    exit 1
fi

# Change to target directory
cd "$TARGET_DIR"

# Check if it's a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Not a git repository. Using find instead (may not respect .gitignore)${NC}" >&2
    USE_GIT=false
else
    USE_GIT=true
fi

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Codebase Statistics Analysis${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "${BLUE}Target Directory: ${NC}$(pwd)"
echo -e "${CYAN}========================================${NC}"
echo ""

# Function to get files respecting .gitignore
get_files() {
    if [ "$USE_GIT" = true ]; then
        git ls-files --cached --others --exclude-standard
    else
        find . -type f -not -path '*/\.git/*' -not -path '*/node_modules/*' -not -path '*/\.next/*' -not -path '*/dist/*' -not -path '*/build/*'
    fi
}

# Get all files
ALL_FILES=$(get_files)
TOTAL_FILES=$(echo "$ALL_FILES" | wc -l)

# Count directories
TOTAL_DIRS=$(echo "$ALL_FILES" | xargs -I{} dirname {} | sort -u | wc -l)

# Count files by extension
VUE_FILES=$(echo "$ALL_FILES" | grep -E '\.vue$' | wc -l || true)
JS_FILES=$(echo "$ALL_FILES" | grep -E '\.js$' | wc -l || true)
TS_FILES=$(echo "$ALL_FILES" | grep -E '\.ts$' | wc -l || true)
TSX_FILES=$(echo "$ALL_FILES" | grep -E '\.tsx$' | wc -l || true)
JSX_FILES=$(echo "$ALL_FILES" | grep -E '\.jsx$' | wc -l || true)
HTML_FILES=$(echo "$ALL_FILES" | grep -E '\.(html|htm)$' | wc -l || true)
CSS_FILES=$(echo "$ALL_FILES" | grep -E '\.(css|scss|sass|less)$' | wc -l || true)
JSON_FILES=$(echo "$ALL_FILES" | grep -E '\.json$' | wc -l || true)
MD_FILES=$(echo "$ALL_FILES" | grep -E '\.md$' | wc -l || true)
OTHER_FILES=$((TOTAL_FILES - VUE_FILES - JS_FILES - TS_FILES - TSX_FILES - JSX_FILES - HTML_FILES - CSS_FILES - JSON_FILES - MD_FILES))

# Count lines of code
TOTAL_LOC=0
VUE_LOC=0
JS_LOC=0
TS_LOC=0
TSX_LOC=0
JSX_LOC=0
HTML_LOC=0
CSS_LOC=0
JSON_LOC=0
MD_LOC=0
OTHER_LOC=0

# Function to count lines in a file
count_lines() {
    wc -l < "$1" 2>/dev/null || echo 0
}

# Count LOC by file type
if [ "$TOTAL_FILES" -gt 0 ]; then
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            lines=$(count_lines "$file")
            TOTAL_LOC=$((TOTAL_LOC + lines))
            
            case "$file" in
                *.vue)
                    VUE_LOC=$((VUE_LOC + lines))
                    ;;
                *.js)
                    JS_LOC=$((JS_LOC + lines))
                    ;;
                *.ts)
                    TS_LOC=$((TS_LOC + lines))
                    ;;
                *.tsx)
                    TSX_LOC=$((TSX_LOC + lines))
                    ;;
                *.jsx)
                    JSX_LOC=$((JSX_LOC + lines))
                    ;;
                *.html|*.htm)
                    HTML_LOC=$((HTML_LOC + lines))
                    ;;
                *.css|*.scss|*.sass|*.less)
                    CSS_LOC=$((CSS_LOC + lines))
                    ;;
                *.json)
                    JSON_LOC=$((JSON_LOC + lines))
                    ;;
                *.md)
                    MD_LOC=$((MD_LOC + lines))
                    ;;
                *)
                    OTHER_LOC=$((OTHER_LOC + lines))
                    ;;
            esac
        fi
    done <<< "$ALL_FILES"
fi

# Calculate average LOC per file
AVG_LOC_PER_FILE=0
if [ "$TOTAL_FILES" -gt 0 ]; then
    AVG_LOC_PER_FILE=$((TOTAL_LOC / TOTAL_FILES))
fi

# Calculate code files (excluding config, docs, etc.)
CODE_FILES=$((VUE_FILES + JS_FILES + TS_FILES + TSX_FILES + JSX_FILES))
CODE_LOC=$((VUE_LOC + JS_LOC + TS_LOC + TSX_LOC + JSX_LOC))

# Calculate complexity metrics
MAX_FILE_LOC=0
MAX_FILE_NAME=""

while IFS= read -r file; do
    if [ -f "$file" ]; then
        lines=$(count_lines "$file")
        if [ "$lines" -gt "$MAX_FILE_LOC" ]; then
            MAX_FILE_LOC=$lines
            MAX_FILE_NAME="$file"
        fi
    fi
done <<< "$ALL_FILES"

# Count files over certain thresholds
FILES_OVER_500=0
FILES_OVER_1000=0
FILES_OVER_2000=0

while IFS= read -r file; do
    if [ -f "$file" ]; then
        lines=$(count_lines "$file")
        if [ "$lines" -gt 500 ]; then
            FILES_OVER_500=$((FILES_OVER_500 + 1))
        fi
        if [ "$lines" -gt 1000 ]; then
            FILES_OVER_1000=$((FILES_OVER_1000 + 1))
        fi
        if [ "$lines" -gt 2000 ]; then
            FILES_OVER_2000=$((FILES_OVER_2000 + 1))
        fi
    fi
done <<< "$ALL_FILES"

# Calculate project size score
SIZE_SCORE=0
SIZE_SCORE=$((SIZE_SCORE + CODE_FILES / 10))
SIZE_SCORE=$((SIZE_SCORE + CODE_LOC / 100))
SIZE_SCORE=$((SIZE_SCORE + FILES_OVER_1000 * 10))
SIZE_SCORE=$((SIZE_SCORE + FILES_OVER_2000 * 20))

# Classify project size
PROJECT_SIZE="small"
if [ "$SIZE_SCORE" -ge 1000 ]; then
    PROJECT_SIZE="damn_big"
elif [ "$SIZE_SCORE" -ge 500 ]; then
    PROJECT_SIZE="big"
elif [ "$SIZE_SCORE" -ge 100 ]; then
    PROJECT_SIZE="medium"
fi

# Print results
echo -e "${GREEN}📊 PROJECT SIZE CLASSIFICATION${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${PURPLE}Project Size: ${BOLD}${PROJECT_SIZE^^}${NC}"
echo -e "${BLUE}Size Score: ${NC}$SIZE_SCORE"
echo ""

echo -e "${GREEN}📁 DIRECTORY STRUCTURE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Total Directories: ${NC}$TOTAL_DIRS"
echo -e "${BLUE}Total Files: ${NC}$TOTAL_FILES"
echo ""

echo -e "${GREEN}📄 FILES BY TYPE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
printf "${BLUE}%-15s ${NC}%6d files\n" "Vue:" "$VUE_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "JavaScript:" "$JS_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "TypeScript:" "$TS_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "TSX:" "$TSX_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "JSX:" "$JSX_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "HTML:" "$HTML_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "CSS/SCSS:" "$CSS_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "JSON:" "$JSON_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "Markdown:" "$MD_FILES"
printf "${BLUE}%-15s ${NC}%6d files\n" "Other:" "$OTHER_FILES"
echo ""

echo -e "${GREEN}📏 LINES OF CODE (LOC) BY TYPE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
printf "${BLUE}%-15s ${NC}%8d lines\n" "Vue:" "$VUE_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "JavaScript:" "$JS_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "TypeScript:" "$TS_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "TSX:" "$TSX_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "JSX:" "$JSX_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "HTML:" "$HTML_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "CSS/SCSS:" "$CSS_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "JSON:" "$JSON_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "Markdown:" "$MD_LOC"
printf "${BLUE}%-15s ${NC}%8d lines\n" "Other:" "$OTHER_LOC"
echo -e "${YELLOW}──────────────────────────────────────${NC}"
printf "${BLUE}%-15s ${NC}%8d lines\n" "TOTAL:" "$TOTAL_LOC"
echo ""

echo -e "${GREEN}📈 COMPLEXITY METRICS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Code Files (Vue/JS/TS): ${NC}$CODE_FILES"
echo -e "${BLUE}Code LOC (Vue/JS/TS): ${NC}$CODE_LOC"
echo -e "${BLUE}Avg LOC per File: ${NC}$AVG_LOC_PER_FILE"
echo -e "${BLUE}Largest File: ${NC}$MAX_FILE_LOC lines ($MAX_FILE_NAME)"
echo ""

echo -e "${GREEN}⚠️  FILE SIZE DISTRIBUTION${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Files > 500 lines: ${NC}$FILES_OVER_500"
echo -e "${BLUE}Files > 1000 lines: ${NC}$FILES_OVER_1000"
echo -e "${BLUE}Files > 2000 lines: ${NC}$FILES_OVER_2000"
echo ""

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Analysis Complete${NC}"
echo -e "${CYAN}========================================${NC}"
