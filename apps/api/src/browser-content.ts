import type {BrowserEventInput} from '@beforeyou/contracts';
/** Keep permitted selected context; request.kind is an untrusted hint for server triage. */
export function browserEventContent(input:BrowserEventInput):string {
 return [
  input.request.visibleText,
  `Page-reported request hint (not independently verified): ${input.request.kind}`,
  ...(input.request.fieldLabels.length?[`Visible field labels:\n${input.request.fieldLabels.map(label=>`- ${label}`).join('\n')}`]:[]),
  ...(input.request.requestedPermissions.length?[`Visible requested permissions:\n${input.request.requestedPermissions.map(permission=>`- ${permission}`).join('\n')}`]:[]),
 ].join('\n\n');
}
