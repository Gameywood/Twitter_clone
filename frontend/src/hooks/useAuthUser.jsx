import { useQuery } from "@tanstack/react-query";

const useAuthUser = () => {
    const { data: authUser } = useQuery({
        queryKey: ['authUser'],
        queryFn: async () => {
            try {
                const res = await fetch('/api/users/auth');
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "Not authenticated");
                }
                return data;
            } catch (error) {
                return null;
            }
        }
    });

    return { authUser };
};

export default useAuthUser;
