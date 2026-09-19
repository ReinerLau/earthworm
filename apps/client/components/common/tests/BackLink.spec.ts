import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";

import BackLink from "../BackLink.vue";

describe("BackLink", () => {
  test("renders a discoverable mobile-friendly link to the fixed parent page", () => {
    const wrapper = mount(BackLink, {
      props: {
        label: "返回课程包列表",
        to: "/course-pack",
      },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });

    const link = wrapper.get("a");

    expect(link.attributes("href")).toBe("/course-pack");
    expect(link.attributes("aria-label")).toBe("返回课程包列表");
    expect(link.text()).toContain("返回课程包列表");
    expect(link.classes()).toEqual(
      expect.arrayContaining(["btn", "min-h-11", "px-4", "text-base"]),
    );
  });

  test("preserves a dynamic course pack detail target for practice pages", () => {
    const wrapper = mount(BackLink, {
      props: {
        label: "返回课程包",
        to: "/course-pack/pack-42",
      },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.get("a").attributes("href")).toBe("/course-pack/pack-42");
    expect(wrapper.get("a").text()).toContain("返回课程包");
  });
});
