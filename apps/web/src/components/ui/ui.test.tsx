import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Button } from "./Button";
import { DialogShell } from "./DialogShell";
import { Input } from "./Input";
import { Label } from "./Label";
import { Textarea } from "./Textarea";
import { Alert } from "./Alert";
import { TabGroup } from "./TabGroup";
import { SectionHeader } from "./SectionHeader";
import { StatusBadge } from "./StatusBadge";
import { Spinner } from "./Spinner";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toHaveTextContent("Click me");
  });

  it("has type=button by default", () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole("button", { name: "OK" })).toHaveAttribute("type", "button");
  });

  it("applies primary variant classes by default", () => {
    render(<Button>Primary</Button>);
    expect(screen.getByRole("button", { name: "Primary" }).className).toMatch(/bg-blue-600/);
  });

  it("applies danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toMatch(/bg-red-600/);
  });

  it("applies ghost variant classes", () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button", { name: "Ghost" }).className).toMatch(/hover:bg-zinc-800/);
  });

  it("applies size sm classes", () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button", { name: "Small" }).className).toMatch(/text-xs/);
  });

  it("applies fullWidth", () => {
    render(<Button fullWidth>Wide</Button>);
    expect(screen.getByRole("button", { name: "Wide" }).className).toMatch(/w-full/);
  });

  it("handles click events", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("can be disabled", () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole("button", { name: "Nope" })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// DialogShell
// ---------------------------------------------------------------------------
describe("DialogShell", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <DialogShell open={false} title="Hidden" onClose={vi.fn()}>
        content
      </DialogShell>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and children when open", () => {
    render(
      <DialogShell open={true} title="My Dialog" onClose={vi.fn()}>
        <p>Body text</p>
      </DialogShell>,
    );
    expect(screen.getByText("My Dialog")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={onClose}>
        x
      </DialogShell>,
    );
    // The close button is the only button (no back button)
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={onClose}>
        x
      </DialogShell>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose on Escape when disabled", () => {
    const onClose = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={onClose} disabled>
        x
      </DialogShell>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders back button when backButton prop is provided", () => {
    const onBack = vi.fn();
    render(
      <DialogShell open={true} title="T" onClose={vi.fn()} backButton={onBack}>
        x
      </DialogShell>,
    );
    const buttons = screen.getAllByRole("button");
    // back button is the first button
    fireEvent.click(buttons[0]!);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });

  it("applies error variant classes", () => {
    render(<Input error placeholder="err" />);
    expect(screen.getByPlaceholderText("err").className).toMatch(/border-red-500/);
  });

  it("applies sm size classes", () => {
    render(<Input size="sm" placeholder="sm" />);
    expect(screen.getByPlaceholderText("sm").className).toMatch(/border-zinc-600/);
  });

  it("forwards additional props", () => {
    render(<Input type="email" placeholder="email" />);
    expect(screen.getByPlaceholderText("email")).toHaveAttribute("type", "email");
  });
});

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------
describe("Label", () => {
  it("renders text content", () => {
    render(<Label>Email</Label>);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("renders as a label element with htmlFor", () => {
    render(<Label htmlFor="x">Name</Label>);
    const label = screen.getByText("Name");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "x");
  });
});

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------
describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea placeholder="Write something" />);
    const el = screen.getByPlaceholderText("Write something");
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("forwards props", () => {
    render(<Textarea rows={5} placeholder="ta" />);
    expect(screen.getByPlaceholderText("ta")).toHaveAttribute("rows", "5");
  });
});

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------
describe("Alert", () => {
  it("renders children", () => {
    render(<Alert variant="info">Info message</Alert>);
    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("applies error variant classes", () => {
    const { container } = render(<Alert variant="error">Err</Alert>);
    expect(container.firstElementChild!.className).toMatch(/border-red-700/);
  });

  it("applies warning variant classes", () => {
    const { container } = render(<Alert variant="warning">Warn</Alert>);
    expect(container.firstElementChild!.className).toMatch(/border-yellow-700/);
  });

  it("applies info variant classes", () => {
    const { container } = render(<Alert variant="info">Info</Alert>);
    expect(container.firstElementChild!.className).toMatch(/border-blue-700/);
  });

  it("renders icon when provided", () => {
    render(
      <Alert variant="info" icon={<span data-testid="icon">!</span>}>
        msg
      </Alert>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TabGroup
// ---------------------------------------------------------------------------
describe("TabGroup", () => {
  const options = [
    { key: "a", label: "Tab A" },
    { key: "b", label: "Tab B" },
  ];

  it("renders all tab options", () => {
    render(<TabGroup value="a" onChange={vi.fn()} options={options} />);
    expect(screen.getByText("Tab A")).toBeInTheDocument();
    expect(screen.getByText("Tab B")).toBeInTheDocument();
  });

  it("calls onChange with the clicked tab key", () => {
    const onChange = vi.fn();
    render(<TabGroup value="a" onChange={onChange} options={options} />);
    fireEvent.click(screen.getByText("Tab B"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("applies active styles to selected tab", () => {
    render(<TabGroup value="a" onChange={vi.fn()} options={options} />);
    expect(screen.getByText("Tab A").className).toMatch(/bg-zinc-700/);
    expect(screen.getByText("Tab B").className).not.toMatch(/bg-zinc-700/);
  });
});

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------
describe("SectionHeader", () => {
  it("renders title as a heading", () => {
    render(<SectionHeader title="Settings" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Settings");
  });

  it("renders action when provided", () => {
    render(<SectionHeader title="T" action={<button type="button">Add</button>} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
describe("StatusBadge", () => {
  it("renders children", () => {
    render(<StatusBadge variant="success">Active</StatusBadge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies success variant classes", () => {
    const { container } = render(<StatusBadge variant="success">Ok</StatusBadge>);
    expect(container.firstElementChild!.className).toMatch(/text-green-400/);
  });

  it("applies error variant classes", () => {
    const { container } = render(<StatusBadge variant="error">Fail</StatusBadge>);
    expect(container.firstElementChild!.className).toMatch(/text-red-400/);
  });

  it("applies warning variant classes", () => {
    const { container } = render(<StatusBadge variant="warning">Warn</StatusBadge>);
    expect(container.firstElementChild!.className).toMatch(/text-yellow-400/);
  });

  it("renders icon when provided", () => {
    render(
      <StatusBadge variant="info" icon={<span data-testid="badge-icon">*</span>}>
        Info
      </StatusBadge>,
    );
    expect(screen.getByTestId("badge-icon")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
describe("Spinner", () => {
  it("renders without crashing", () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it("renders text when provided", () => {
    render(<Spinner text="Loading..." />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("does not render text span when text is omitted", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("span")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
describe("Skeleton", () => {
  it("renders with animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toBeInTheDocument();
    expect(container.firstElementChild!.className).toMatch(/animate-pulse/);
  });

  it("merges custom className", () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    expect(container.firstElementChild!.className).toMatch(/h-4/);
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
describe("EmptyState", () => {
  it("renders the message", () => {
    render(<EmptyState message="No items found" />);
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(<EmptyState message="Empty" action={<button type="button">Create</button>} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("does not render action when omitted", () => {
    const { container } = render(<EmptyState message="Empty" />);
    expect(container.querySelector("button")).toBeNull();
  });
});
