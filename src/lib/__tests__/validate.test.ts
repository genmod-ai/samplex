import { describe, expect, it } from "vitest";
import { validateSlug } from "../validate.js";

describe("validateSlug", () => {
  describe("valid slugs (returns null)", () => {
    it("accepts minimum length of 3 chars", () => {
      expect(validateSlug("abc")).toBeNull();
    });

    it("accepts maximum length of 48 chars", () => {
      expect(validateSlug("a".repeat(48))).toBeNull();
    });

    it("accepts a typical slug", () => {
      expect(validateSlug("my-project")).toBeNull();
    });

    it("accepts slug with hyphens", () => {
      expect(validateSlug("hello-world-123")).toBeNull();
    });
  });

  describe("too short", () => {
    it("rejects empty string", () => {
      expect(validateSlug("")).toBe("Slug must be at least 3 characters");
    });

    it("rejects exactly 2 chars (boundary)", () => {
      expect(validateSlug("ab")).toBe("Slug must be at least 3 characters");
    });

    it("rejects 1 char", () => {
      expect(validateSlug("a")).toBe("Slug must be at least 3 characters");
    });
  });

  describe("too long", () => {
    it("rejects exactly 49 chars (boundary)", () => {
      expect(validateSlug("a".repeat(49))).toBe("Slug must be at most 48 characters");
    });

    it("rejects strings over 48 chars", () => {
      expect(validateSlug("a".repeat(60))).toBe("Slug must be at most 48 characters");
    });
  });

  describe("invalid characters", () => {
    it("rejects uppercase letters", () => {
      expect(validateSlug("MySlug")).toBe(
        "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
      );
    });

    it("rejects special characters", () => {
      expect(validateSlug("my_slug")).toBe(
        "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
      );
    });

    it("rejects slug starting with a hyphen", () => {
      expect(validateSlug("-myslug")).toBe(
        "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
      );
    });

    it("rejects slug ending with a hyphen", () => {
      expect(validateSlug("myslug-")).toBe(
        "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
      );
    });
  });

  describe("consecutive hyphens", () => {
    it("rejects double hyphens", () => {
      expect(validateSlug("my--slug")).toBe(
        'Slug cannot contain consecutive hyphens ("--" is used as a separator)',
      );
    });

    it("rejects triple hyphens", () => {
      expect(validateSlug("my---slug")).toBe(
        'Slug cannot contain consecutive hyphens ("--" is used as a separator)',
      );
    });
  });
});
