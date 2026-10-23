/** A copy of a channel icon from ChannelIconTemplate.astro, or null if there's no such icon. */
export const cloneIcon = (name: string): Element | null => {
    const template = document.querySelector<HTMLTemplateElement>("#channel-icons");
    const icon = template?.content.querySelector(`[data-icon-name="${name}"]`)?.firstElementChild;
    return (icon?.cloneNode(true) as Element | undefined) ?? null;
};
