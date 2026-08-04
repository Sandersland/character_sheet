import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ImageUploadControl from "@/components/ui/ImageUploadControl";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/imageUpload";
import { axe } from "@/test/axe";

// jsdom ships neither object-URL static; the component's preview depends on both.
const createObjectURL = vi.fn(() => "blob:preview-url");
const revokeObjectURL = vi.fn();
beforeAll(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

const png = () => new File([new Uint8Array(8)], "hero.png", { type: "image/png" });

function renderControl(props: Partial<React.ComponentProps<typeof ImageUploadControl>> = {}) {
  const onSelect = vi.fn();
  const onRemove = vi.fn();
  const utils = render(
    <ImageUploadControl label="Portrait" onSelect={onSelect} onRemove={onRemove} {...props} />,
  );
  return { onSelect, onRemove, ...utils };
}

describe("ImageUploadControl", () => {
  it("renders the empty state: placeholder, Choose image, no Remove", () => {
    renderControl();
    expect(screen.getByText("No image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose image" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("passes a valid image to onSelect with no refusal message", async () => {
    const { onSelect } = renderControl();
    const file = png();

    await userEvent.upload(screen.getByLabelText("Portrait"), file);

    expect(onSelect).toHaveBeenCalledWith(file);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses a non-image file: message shown, onSelect never called", async () => {
    const { onSelect } = renderControl();
    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });

    // applyAccept off: the real browser picker can also hand over any file.
    await userEvent.upload(screen.getByLabelText("Portrait"), txt, { applyAccept: false });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't a supported image/);
  });

  it("refuses an oversized image: message shown, onSelect never called", async () => {
    const { onSelect } = renderControl();
    const big = new File([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], "big.png", {
      type: "image/png",
    });

    await userEvent.upload(screen.getByLabelText("Portrait"), big);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/too large/);
  });

  it("clears a previous refusal once a valid file is picked", async () => {
    const { onSelect } = renderControl();
    const input = screen.getByLabelText("Portrait");

    await userEvent.upload(input, new File(["x"], "x.txt", { type: "text/plain" }), {
      applyAccept: false,
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.upload(input, png());
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("previews a staged file via an object URL and revokes it on unmount", async () => {
    const { unmount } = renderControl({ file: png() });

    const img = await screen.findByRole("img", { name: "Portrait preview" });
    expect(img).toHaveAttribute("src", "blob:preview-url");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-url");
  });

  it("previews imageUrl when no file is staged and offers Replace/Remove", () => {
    renderControl({ imageUrl: "/api/characters/c1/portrait?v=abc" });

    expect(screen.getByRole("img", { name: "Portrait preview" })).toHaveAttribute(
      "src",
      "/api/characters/c1/portrait?v=abc",
    );
    expect(screen.getByRole("button", { name: "Replace image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("prefers the staged file's preview over imageUrl", async () => {
    renderControl({ imageUrl: "/api/characters/c1/portrait?v=abc", file: png() });

    const img = await screen.findByRole("img", { name: "Portrait preview" });
    expect(img).toHaveAttribute("src", "blob:preview-url");
  });

  it("Remove calls onRemove", async () => {
    const { onRemove } = renderControl({ imageUrl: "/img.png" });

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("pending disables the actions and shows a spinner", () => {
    renderControl({ imageUrl: "/img.png", pending: true });

    expect(screen.getByRole("button", { name: "Replace image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders a caller-supplied error", () => {
    renderControl({ error: "Failed to upload the portrait" });

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to upload the portrait");
  });

  it("has no axe violations in empty and populated states", async () => {
    const { container } = renderControl({ imageUrl: "/img.png", error: "boom" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
