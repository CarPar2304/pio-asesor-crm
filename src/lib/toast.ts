import { sileo } from "sileo";

export const showSuccess = (title: string, description?: string) =>
  sileo.success({ title, description });

export const showError = (title: string, description?: string) =>
  sileo.error({ title, description });

export const showWarning = (title: string, description?: string) =>
  sileo.warning({ title, description });

export const showInfo = (title: string, description?: string) =>
  sileo.info({ title, description });

export { sileo };
