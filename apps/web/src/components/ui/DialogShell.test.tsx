import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DialogShell } from "./DialogShell";

afterEach(() => {
  cleanup();
});

describe("DialogShell", () => {
  it("returns null when open=false", () => {
    const { container } = render(
      <DialogShell open={false} title="Hidden" onClose={vi.fn()}>
        content
      </DialogShell>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog with title and children when open=true", () => {
    render(
      <DialogShell open={true} title="My Dialog" onClose={vi.fn()}>
        <p>Body text</p>
      </DialogShell>,
    );
    expect(screen.getByText("My Dialog")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={onClose}>
        content
      </DialogShell>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose on Escape when disabled", () => {
    const onClose = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={onClose} disabled>
        content
      </DialogShell>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focus trap: Tab from last focusable wraps to first", () => {
    render(
      <DialogShell open={true} title="T" onClose={vi.fn()}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </DialogShell>,
    );

    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>("button:not([disabled])");
    const last = focusable[focusable.length - 1]!;
    const first = focusable[0]!;

    // Focus the last focusable element
    last.focus();
    expect(document.activeElement).toBe(last);

    // Press Tab — should wrap to first
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("focus trap: Shift+Tab from first focusable wraps to last", () => {
    render(
      <DialogShell open={true} title="T" onClose={vi.fn()}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </DialogShell>,
    );

    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>("button:not([disabled])");
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    // Focus the first focusable element
    first.focus();
    expect(document.activeElement).toBe(first);

    // Press Shift+Tab — should wrap to last
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={onClose}>
        content
      </DialogShell>,
    );

    // The backdrop is the outer fixed div (parent of the dialog)
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose on backdrop click when disabled", () => {
    const onClose = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={onClose} disabled>
        content
      </DialogShell>,
    );

    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders back button when backButton prop is provided", () => {
    const onBack = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={vi.fn()} backButton={onBack}>
        content
      </DialogShell>,
    );

    const backBtn = screen.getByRole("button", { name: "Go back" });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
