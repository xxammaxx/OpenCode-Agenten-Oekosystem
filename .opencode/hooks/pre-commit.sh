# Pre-Commit Hook
# Enforces test and evidence gates before git commit.

echo "=== Pre-Commit Gate ==="

# 1. Run tests
echo "[1/4] Running tests..."
npm test
if [ $? -ne 0 ]; then
  echo "BLOCKED: Tests failed. Fix tests before committing."
  exit 1
fi

# 2. Run type check
echo "[2/4] Running type check..."
npm run typecheck 2>/dev/null || echo "WARNING: Type check not available"

# 3. Run lint
echo "[3/4] Running lint..."
npm run lint 2>/dev/null || echo "WARNING: Lint not available"

# 4. Check for secrets
echo "[4/4] Checking for secrets..."
if git diff --cached --name-only | xargs grep -l "API_KEY\|SECRET\|TOKEN.*=.*ghp_" 2>/dev/null; then
  echo "BLOCKED: Potential secrets detected in staged files."
  exit 1
fi

echo "Pre-commit gate passed."
