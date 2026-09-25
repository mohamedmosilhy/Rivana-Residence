import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FoundationNotice } from "@/presentation/ui/foundation-notice";

describe("FoundationNotice", () => {
  it("announces its status text", () => {
    render(<FoundationNotice>Foundation ready</FoundationNotice>);

    expect(screen.getByRole("status")).toHaveTextContent("Foundation ready");
  });
});
