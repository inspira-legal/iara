import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

const MockIcon = (props: Record<string, unknown>) => <svg data-testid="mock-icon" {...props} />;

describe("EmptyState", () => {
  it("renders message text", () => {
    render(<EmptyState message="No items found" />);
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<EmptyState message="Empty" icon={MockIcon as never} />);
    expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
  });

  it("does not render icon when not provided", () => {
    const { container } = render(<EmptyState message="Empty" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders action when provided", () => {
    render(<EmptyState message="Empty" action={<button type="button">Create</button>} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<EmptyState message="Empty" className="my-custom-class" />);
    expect(container.firstElementChild).toHaveClass("my-custom-class");
  });
});
