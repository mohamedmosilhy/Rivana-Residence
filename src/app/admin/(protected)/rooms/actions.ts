"use server";

import { roomInputFromForm } from "@/application/content/catalog-forms";
import { roomCommands } from "@/composition/content";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { catalogActions } from "../catalog-actions";

const rooms = catalogActions(
  roomCommands,
  "/admin/rooms",
  roomInputFromForm,
  "room",
);

export async function createRoomAction(_state: FormState, formData: FormData) {
  return rooms.create(formData);
}

export async function updateRoomAction(
  id: string,
  _state: FormState,
  formData: FormData,
) {
  return rooms.update(id, formData);
}

export async function saveRoomMediaAction(
  id: string,
  _state: FormState,
  formData: FormData,
) {
  return rooms.media(id, formData);
}

export async function publishRoomAction(id: string) {
  return rooms.transition("publish", id);
}

export async function unpublishRoomAction(id: string) {
  return rooms.transition("unpublish", id);
}

export async function archiveRoomAction(id: string) {
  return rooms.transition("archive", id);
}

export async function restoreRoomAction(id: string) {
  return rooms.transition("restore", id);
}

export async function deleteRoomAction(id: string) {
  return rooms.delete(id);
}

export async function moveRoomAction(id: string, offset: -1 | 1) {
  return rooms.move(id, offset);
}
