permission_state() {
    if answer="$(kubectl auth can-i "$1" "$2" --namespace "$3")"; then
        status=0
    else
        status=$?
    fi
    case "$status:$answer" in
        0:yes) printf 'ALLOW\n'; return 0 ;;
        1:no) printf 'DENY\n'; return 0 ;;
        *) printf 'ERROR\n'; return 2 ;;
    esac
}
