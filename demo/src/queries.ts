import { queryOptions } from "@tanstack/react-query";
import { evaluate } from "./api";
import { contextFor, type Selection } from "./users";

export function flagsQuery(selection: Selection) {
  return queryOptions({
    queryKey: ["flags", selection.env, selection.user.key],
    queryFn: () => evaluate(selection.env, contextFor(selection.user)),
  });
}
