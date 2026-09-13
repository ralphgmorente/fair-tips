/**
 * Shape of the settings that decide how tips are split.
 *
 * Kept out of the "use server" module on purpose: a server-action file may only export
 * async functions, so exporting a constant from there fails every action in the app at
 * runtime rather than at build time.
 */
export type WorkspaceSettings = {
  eventDeviceName: string;
  ignoredSalesNames: string[];
};

export const emptySettings: WorkspaceSettings = {
  eventDeviceName: "",
  ignoredSalesNames: []
};
