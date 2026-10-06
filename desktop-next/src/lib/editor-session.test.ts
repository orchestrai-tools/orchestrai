import { expect, test } from "vitest";
import { editorPlaceToStore } from "./editor-session";

const place = { anchor: 12, head: 18, scrollTop: 0, scrollLeft: 0 };

test("a short file keeps the cursor and leaves the saved scroll alone", () => {
  expect(editorPlaceToStore(place, 0, 0)).toEqual({ anchor: 12, head: 18 });
  expect(editorPlaceToStore({ ...place, scrollTop: 40 }, 200, 0)).toEqual({
    anchor: 12,
    head: 18,
    scrollTop: 40,
  });
  expect(editorPlaceToStore(place, 200, 80)).toEqual({
    anchor: 12,
    head: 18,
    scrollTop: 0,
    scrollLeft: 0,
  });
});
