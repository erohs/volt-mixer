/**
 * A copy of an icon from a page template: the channel icons (ChannelIconTemplate.astro) or the
 * message icons (Notice.astro). Null if there's no such icon.
 */
export const cloneIcon = (name: string, template = "#channel-icons"): Element | null => {
    const source = document.querySelector<HTMLTemplateElement>(template);
    const icon = source?.content.querySelector(`[data-icon-name="${name}"]`)?.firstElementChild;
    return (icon?.cloneNode(true) as Element | undefined) ?? null;
};
