# Audit Log Writer
# Writes structured audit entries for agent actions.

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_DIR=".opencode/logs/audit"
LOG_FILE="$LOG_DIR/audit-$(date +%Y-%m-%d).jsonl"

mkdir -p "$LOG_DIR"

write_audit_entry() {
  local action="$1"
  local details="$2"

  local entry=$(cat <<EOF
{"timestamp":"$TIMESTAMP","session_id":"${SESSION_ID:-unknown}","agent":"${AGENT:-unknown}","action":"$action","details":"$details"}
EOF
)
  echo "$entry" >> "$LOG_FILE"
}

# Example usage:
# write_audit_entry "tool_call" "bash: npm test"
# write_audit_entry "decision" "approved migration"
# write_audit_entry "delegation" "delegated to review-agent"
