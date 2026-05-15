# Post-Edit Hook
# Records the edit in the audit trail.

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID="${SESSION_ID:-unknown}"
AGENT="${AGENT:-unknown}"

AUDIT_ENTRY=$(cat <<EOF
{"timestamp":"$TIMESTAMP","session_id":"$SESSION_ID","agent":"$AGENT","action":"file_edit","file":"$FILE_PATH","lines_changed":"$LINES_CHANGED"}
EOF
)

echo "$AUDIT_ENTRY" >> .opencode/logs/audit/audit-$(date +%Y-%m-%d).jsonl
echo "Post-edit audit logged."
