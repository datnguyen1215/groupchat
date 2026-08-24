<script lang="ts">
	type Props = {
		initials: string;
		color: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		shape?: 'square' | 'circle';
	};

	const { initials, color, size = 'sm', shape = 'square' }: Props = $props();

	const box = {
		xs: 'w-[15px] h-[15px] text-[6.5px]',
		sm: 'w-[22px] h-[22px] text-[9px]',
		md: 'w-[26px] h-[26px] text-[10px]',
		lg: 'w-[33px] h-[33px] text-[12.5px]'
	};
</script>

<span
	class="grid flex-none place-items-center font-bold text-bg {box[size]} {shape === 'circle'
		? 'rounded-full'
		: 'rounded-[7px]'}"
	style:background={color}
	style:color={color === '#2e2e35' ? 'var(--color-ink-2)' : undefined}
>
	{initials}
</span>
