import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { MediaOption } from "@/application/ports/repositories";
import {
  ImageList,
  SingleImage,
} from "@/presentation/admin/media/image-choice";
import { MediaPicker } from "@/presentation/admin/media/media-picker";
import { Uploader } from "@/presentation/admin/media/uploader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const options: MediaOption[] = [
  {
    id: "pool",
    storageKey: "images/2026/09/pool.webp",
    altText: "Indoor pool",
    originalFilename: "pool.jpg",
    width: 10,
    height: 10,
    rightsConfirmed: true,
  },
  {
    id: "gym",
    storageKey: "images/2026/09/gym.webp",
    altText: "Fitness room",
    originalFilename: "gym.jpg",
    width: 10,
    height: 10,
    rightsConfirmed: false,
  },
  {
    id: "bed",
    storageKey: "images/2026/09/bed.webp",
    altText: "",
    originalFilename: "bed.jpg",
    width: 10,
    height: 10,
    rightsConfirmed: true,
  },
];

describe("MediaPicker", () => {
  it("searches, picks with native controls, and returns focus", () => {
    const onPick = vi.fn();
    render(
      <MediaPicker
        options={options}
        triggerLabel="Choose hero"
        title="Choose hero"
        multiple={false}
        onPick={onPick}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Choose hero" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Choose hero" });
    expect(
      within(dialog).getByLabelText("Search by description or file name"),
    ).toHaveFocus();
    expect(
      within(dialog).getByText("Rights not confirmed"),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/Search/), {
      target: { value: "pool" },
    });
    const radios = within(dialog).getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(
      within(dialog).getByRole("button", { name: "Use image" }),
    ).toBeDisabled();

    fireEvent.click(radios[0]!);
    fireEvent.click(within(dialog).getByRole("button", { name: "Use image" }));
    expect(onPick).toHaveBeenCalledWith(["pool"]);
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("allows several choices and hides excluded images", () => {
    const onPick = vi.fn();
    render(
      <MediaPicker
        options={options}
        triggerLabel="Add images"
        title="Add"
        multiple
        exclude={["pool"]}
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add images" }));
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    boxes.forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: "Use 2 images" }));
    expect(onPick).toHaveBeenCalledWith(["gym", "bed"]);
  });

  it("explains an empty library", () => {
    render(
      <MediaPicker
        options={[]}
        triggerLabel="Choose"
        title="Choose"
        multiple={false}
        onPick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(screen.getByText(/no ready images yet/)).toBeInTheDocument();
  });
});

describe("image choices", () => {
  it("shows, changes, and removes a single image with a contextual alt text", () => {
    const onChange = vi.fn();
    render(
      <SingleImage
        label="Hero image"
        options={options}
        value={{ mediaId: "pool", altOverride: null }}
        onChange={onChange}
        withAltOverride
      />,
    );
    expect(
      screen.getByText("Indoor pool", { selector: ".admin-image-choice span" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Alt text here/), {
      target: { value: "Pool at night" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      mediaId: "pool",
      altOverride: "Pool at night",
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove hero image" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("reorders and removes gallery images with named buttons", () => {
    const onChange = vi.fn();
    render(
      <ImageList
        label="Gallery"
        options={options}
        value={[
          { mediaId: "pool", altOverride: null },
          { mediaId: "gym", altOverride: null },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Move down: Indoor pool" }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { mediaId: "gym", altOverride: null },
      { mediaId: "pool", altOverride: null },
    ]);
    expect(
      screen.getByText("Image moved to position 2 of 2."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove: Fitness room" }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { mediaId: "pool", altOverride: null },
    ]);
  });
});

describe("Uploader", () => {
  it("requires the rights confirmation before uploading", () => {
    render(<Uploader />);
    const input = screen.getByLabelText("Choose images", { selector: "input" });
    fireEvent.change(input, {
      target: { files: [new File(["x"], "pool.jpg", { type: "image/jpeg" })] },
    });
    expect(
      screen.getByText("Confirm the usage rights before uploading."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/I confirm Rivana Residence may use these images/),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("pool.jpg")).not.toBeInTheDocument();
  });

  it("offers a keyboard-reachable button as the alternative to drag and drop", () => {
    render(<Uploader multiple={false} />);
    expect(
      screen.getByRole("button", { name: "Choose an image" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Location and camera details are removed/),
    ).toBeInTheDocument();
  });
});

describe("useUnsavedChanges", () => {
  it("keeps stable callbacks so effects that depend on them run once", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useUnsavedChanges } = await import(
      "@/presentation/admin/ui/use-unsaved-changes"
    );
    const { result, rerender } = renderHook(() => useUnsavedChanges());
    const first = result.current;
    rerender();
    expect(result.current.markDirty).toBe(first.markDirty);
    expect(result.current.markSaved).toBe(first.markSaved);
  });
});
