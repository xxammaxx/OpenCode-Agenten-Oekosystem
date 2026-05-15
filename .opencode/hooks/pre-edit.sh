# Pre-Edit Hook
# Validates that the edit complies with evidence gates before allowing it.

# Check if this is a security claim edit
if [[ "$FILE_PATH" =~ security ]] || [[ "$FILE_PATH" =~ vulnerability ]]; then
  echo "WARNING: Editing security-related file. Ensure evidence gate is satisfied."
  echo "Required: PoC, logs, CVSS vector, impact demonstration"
fi

# Check if this is a policy file edit
if [[ "$FILE_PATH" =~ \.opencode/policies/ ]]; then
  echo "WARNING: Editing policy file. This requires explicit human approval."
  echo "Proceed only if explicitly authorized."
fi

# Check for production data patterns
if [[ "$CONTENT" =~ production ]] && [[ "$CONTENT" =~ (DELETE|DROP|UPDATE) ]]; then
  echo "BLOCKED: Production data modification detected."
  exit 1
fi

echo "Pre-edit validation passed."
