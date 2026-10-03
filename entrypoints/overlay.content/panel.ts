import { el } from './dom';

export interface PanelTab<Id extends string> {
  id: Id;
  label: string;
  element: HTMLElement;
  /** タブの右端に、選んでいる間だけ出す要素 */
  tool?: HTMLElement;
  onSelect?(selected: boolean): void;
}

export interface Panel<Id extends string> {
  readonly element: HTMLElement;
  tabButton(id: Id): HTMLButtonElement;
}

/** タブで中身を切り替える右パネル。最初のタブを選んだ状態で始める。 */
export function mountPanel<Id extends string>(tabs: PanelTab<Id>[]): Panel<Id> {
  const element = el('aside', 'panel');
  const tabList = el('div', 'tabs');
  tabList.setAttribute('role', 'tablist');
  const buttons = new Map<Id, HTMLButtonElement>();
  const select = (id: Id) => {
    for (const t of tabs) {
      const selected = t.id === id;
      buttons.get(t.id)!.setAttribute('aria-selected', String(selected));
      t.element.hidden = !selected;
      if (t.tool) t.tool.hidden = !selected;
      t.onSelect?.(selected);
    }
  };
  for (const t of tabs) {
    const b = el('button', 'tab', t.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => select(t.id));
    buttons.set(t.id, b);
    tabList.append(b);
    t.element.classList.add('tabpanel');
  }
  tabList.append(...tabs.flatMap((t) => (t.tool ? [t.tool] : [])));
  element.append(tabList, ...tabs.map((t) => t.element));
  if (tabs[0]) select(tabs[0].id);
  return { element, tabButton: (id) => buttons.get(id)! };
}
