permission_state() {
    if ! answer="$(kubectl auth can-i "$1" "$2" --namespace "$3")"; then
        printf 'ERROR\n'
        return 2
    fi
    case "$answer" in
        yes) printf 'ALLOW\n'; return 0 ;;
        no) printf 'DENY\n'; return 0 ;;
        *) printf 'ERROR\n'; return 2 ;;
    esac
}
