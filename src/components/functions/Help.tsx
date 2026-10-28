import { FUNCTIONS, type FunctionDef } from "@/lib/functions";

const GROUPS: FunctionDef["group"][] = ["Security", "Market", "Macro", "System"];

export function Help() {
  return (
    <table>
      {GROUPS.map((group) => (
        <tbody key={group}>
          <tr>
            <th colSpan={3} className="pt-4 pb-1 text-left font-normal text-muted uppercase">
              {group}
            </th>
          </tr>
          {FUNCTIONS.filter((f) => f.group === group).map((f) => (
            <tr key={f.code}>
              <td className="pr-6 font-semibold text-amber">{f.code}</td>
              <td className="pr-6">{f.title}</td>
              <td className="text-muted">{f.example}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
