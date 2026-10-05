import type { ColumnSettingField, ColumnTypeDefinition, ColumnTypeKey } from "./types";

const generalSettings: ColumnSettingField[] = [
  { name: "label", label: "Label", type: "text", section: "general", description: "User-facing column label." },
  { name: "description", label: "Description", type: "textarea", section: "general", description: "Helper text shown in settings and forms." },
  { name: "required", label: "Required", type: "checkbox", section: "general", description: "Prevent empty values on create and edit." },
  { name: "defaultValue", label: "Default value", type: "json", section: "general", description: "Serialized default applied to new records." },
];

const formattingSettings: ColumnSettingField[] = [
  { name: "format", label: "Format", type: "select", section: "formatting", options: [
    { label: "Auto", value: "auto" },
    { label: "Compact", value: "compact" },
    { label: "Expanded", value: "expanded" },
  ] },
];

const validationSettings: ColumnSettingField[] = [
  { name: "min", label: "Minimum", type: "number", section: "validation" },
  { name: "max", label: "Maximum", type: "number", section: "validation" },
  { name: "pattern", label: "Pattern", type: "text", section: "validation", description: "Regex pattern for text-like types." },
];

const permissionSettings: ColumnSettingField[] = [
  { name: "permissions", label: "Permissions", type: "json", section: "permissions", description: "Role-based view, edit, and configure access." },
];

const advancedSettings: ColumnSettingField[] = [
  { name: "formula", label: "Formula", type: "formula", section: "advanced", description: "Formula expression for derived values." },
  { name: "connectedBoardTarget", label: "Connected board target", type: "json", section: "advanced", description: "Board / group / column pointer for connected columns." },
  { name: "mirrorSource", label: "Mirror source", type: "json", section: "advanced", description: "Source board and column for mirror fields." },
];

const connectedBoardSettings: ColumnSettingField[] = [
  { name: "connected_board_ids", label: "Connected boards", type: "json", section: "general", fromSettings: true, description: "Boards this column can link to." },
  { name: "allow_multiple_items", label: "Allow linking to multiple items", type: "checkbox", section: "general", fromSettings: true, description: "Allow a single cell to link to more than one item." },
  { name: "two_way_sync", label: "Two-way sync", type: "checkbox", section: "general", fromSettings: true, description: "Also update the other board when linking." },
  { name: "linked_column_id_on_other_board", label: "Linked column on other board", type: "json", section: "general", fromSettings: true, description: "Reciprocal column once created." },
];

const mirrorSettingsFields: ColumnSettingField[] = [
  { name: "source_connect_column_id", label: "Connect Boards column", type: "json", section: "general", fromSettings: true, description: "The Connected Boards column this mirror rides on." },
  { name: "mirrored_column_id", label: "Mirrored column (legacy)", type: "json", section: "general", fromSettings: true, description: "Legacy single mirrored column." },
  { name: "mirrored_columns", label: "Mirrored columns", type: "json", section: "general", fromSettings: true, description: "Array of { board_id, column_id, aggregation } for multi-column mirrors." },
  { name: "display_config", label: "Display config", type: "json", section: "general", fromSettings: true, description: '{"aggregation":"sum"|"average"|"latest"|null, "display_mode":"stacked"|"separate"}' },
];

function definition(key: ColumnTypeKey, overrides: Partial<ColumnTypeDefinition> = {}): ColumnTypeDefinition {
  return {
    key,
    label: overrides.label ?? key,
    description: overrides.description ?? "Metadata-driven column type.",
    category: overrides.category ?? "core",
    defaultValue: overrides.defaultValue ?? null,
    compatibleTypes: overrides.compatibleTypes ?? [],
    settingsSchema: overrides.settingsSchema ?? [...generalSettings, ...formattingSettings, ...validationSettings, ...permissionSettings, ...advancedSettings],
    allowEmpty: overrides.allowEmpty ?? true,
    supportsPermissions: overrides.supportsPermissions ?? true,
    ...(overrides.defaultOptions ? { defaultOptions: overrides.defaultOptions } : {}),
  };
}

export const columnTypeRegistry: Record<ColumnTypeKey, ColumnTypeDefinition> = {
  text: definition("text", { label: "Text", description: "Single-line text entry.", defaultValue: "" , compatibleTypes: ["long_text", "dropdown", "person", "email", "phone", "url", "tags"] }),
  long_text: definition("long_text", { label: "Long Text", description: "Multi-line rich text.", defaultValue: "", compatibleTypes: ["text", "dropdown", "tags"] }),
  number: definition("number", { label: "Number", description: "Numeric value with arithmetic support.", defaultValue: 0, compatibleTypes: ["currency", "rating", "progress"] }),
  currency: definition("currency", { label: "Currency", description: "Money value with locale formatting.", defaultValue: 0, compatibleTypes: ["number", "progress"] }),
  date: definition("date", { label: "Date", description: "Single date value.", defaultValue: null, compatibleTypes: ["timeline", "text"] }),
  timeline: definition("timeline", { label: "Timeline", description: "Date range or schedule block.", defaultValue: { start: null, end: null }, compatibleTypes: ["date"] }),
   status: definition("status", { label: "Status", description: "Discrete workflow state.", defaultValue: "", compatibleTypes: ["priority", "dropdown", "tags"], defaultOptions: [
    { id: "opt-not-started", label: "Not Started", color: "#C4C4C4" },
    { id: "opt-working-on-it", label: "Working on it", color: "#EBAD54" },
    { id: "opt-done", label: "Done", color: "#68C37D" },
    { id: "opt-stuck", label: "Stuck", color: "#C5434E" },
  ] }),
  priority: definition("priority", { label: "Priority", description: "Priority label or score.", defaultValue: "normal", compatibleTypes: ["status", "dropdown"] }),
  dropdown: definition("dropdown", { label: "Dropdown", description: "Single-select option list.", defaultValue: "", compatibleTypes: ["status", "priority", "tags"] }),
  multi_select: definition("multi_select", { label: "Multi Select", description: "Multi-select option list.", defaultValue: [], compatibleTypes: ["tags"] }),
  checkbox: definition("checkbox", { label: "Checkbox", description: "Boolean true / false.", defaultValue: false, compatibleTypes: ["text", "number"] }),
  person: definition("person", { label: "Person", description: "User picker.", defaultValue: null, compatibleTypes: ["text", "email"] }),
  email: definition("email", { label: "Email", description: "Email address.", defaultValue: "", compatibleTypes: ["text", "url"] }),
  phone: definition("phone", { label: "Phone", description: "Phone number.", defaultValue: "", compatibleTypes: ["text"] }),
  url: definition("url", { label: "URL", description: "Link value.", defaultValue: "", compatibleTypes: ["text", "email"] }),
  formula: definition("formula", { label: "Formula", description: "Computed value from other columns.", defaultValue: null, category: "formula", compatibleTypes: ["number", "currency", "status", "text"] }),
  files: definition("files", { label: "Files", description: "Attachment collection.", defaultValue: [], compatibleTypes: ["tags"] }),
  rating: definition("rating", { label: "Rating", description: "Ordinal rating value.", defaultValue: 0, compatibleTypes: ["number", "priority"] }),
  tags: definition("tags", { label: "Tags", description: "Freeform tag tokens.", defaultValue: [], compatibleTypes: ["text", "multi_select", "dropdown"] }),
  connected_board: definition("connected_board", { label: "Connected Board", description: "Reference to another board.", defaultValue: null, category: "future", supportsPermissions: true, settingsSchema: [...connectedBoardSettings] }),
  mirror: definition("mirror", { label: "Mirror", description: "Read-only value mirrored from a column on a connected board.", defaultValue: null, category: "connected_data", supportsPermissions: false, settingsSchema: [...mirrorSettingsFields] }),
  lookup: definition("lookup", { label: "Lookup", description: "Derived lookup value from a related board.", defaultValue: null, category: "future", supportsPermissions: false }),
  rollup: definition("rollup", { label: "Rollup", description: "Aggregated value from related records.", defaultValue: null, category: "future", supportsPermissions: false }),
  ai_field: definition("ai_field", { label: "AI Field", description: "Generated or assisted content.", defaultValue: null, category: "future" }),
  button: definition("button", { label: "Button", description: "Action trigger column.", defaultValue: null, category: "future", supportsPermissions: false }),
  progress: definition("progress", { label: "Progress", description: "Percent-complete style field.", defaultValue: 0, compatibleTypes: ["number", "rating", "currency"] }),
  time_tracking: definition("time_tracking", { label: "Time Tracking", description: "Work duration and timers.", defaultValue: { startedAt: null, totalSeconds: 0 }, category: "future" }),
};

export const columnCompatibilityMatrix: Record<ColumnTypeKey, ColumnTypeKey[]> = Object.fromEntries(
  Object.entries(columnTypeRegistry).map(([key, definition]) => [key, definition.compatibleTypes]),
) as Record<ColumnTypeKey, ColumnTypeKey[]>;

export function getColumnTypeDefinition(type: ColumnTypeKey): ColumnTypeDefinition {
  return columnTypeRegistry[type];
}
