/** Minimal uuid shim - AdminService only uses v4 to generate IDs. */
export function v4(): string {
    return "test-uuid-" + Math.random().toString(36).slice(2);
}
export default { v4 };
